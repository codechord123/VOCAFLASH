// Claude API 클라이언트.
//
// 브라우저에서 직접 호출한다. 개인용 앱이고 본인 키를 본인 기기에
// 두는 구조라 이게 가장 단순하다. 대가는 키가 브라우저에 노출되는
// 것 — 공용 PC에서는 쓰지 말라고 설정 화면에 경고를 띄운다.
//
// 이 앱에서 AI가 하는 일은 딱 두 가지다.
//   1) 어휘 뜻풀이 보강 — 시트 1,948행 중 41개만 채워져 있다
//   2) 스크립트 해설 — 아직 1회독인 챕터
// 문장 연습 문제는 AI를 쓰지 않는다. 한영 문장쌍이 이미 있다.

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export class ClaudeError extends Error {
  constructor(message, { status, type } = {}) {
    super(message)
    this.name = 'ClaudeError'
    this.status = status
    this.type = type
  }
}

/** 상태 코드를 사용자가 읽을 수 있는 한국어로. */
function describe(status, body) {
  const type = body?.error?.type
  switch (status) {
    case 401:
      return 'API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.'
    case 403:
      return '이 API 키에 권한이 없습니다.'
    case 404:
      return `모델을 찾을 수 없습니다. 설정의 모델 이름을 확인해 주세요.`
    case 429:
      return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
    case 529:
      return 'Claude 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.'
    default:
      if (status >= 500) return `Claude 서버 오류(${status}). 잠시 후 재시도해 주세요.`
      return body?.error?.message ?? `요청이 실패했습니다(${status}, ${type ?? '원인 불명'}).`
  }
}

/**
 * 구조화 출력으로 한 번 호출한다.
 *
 * 마크다운을 파싱하면 반드시 깨진다 — 어휘 표를 정규식으로 뜯는 건
 * 이 프로젝트에서 이미 실패한 방식이다(시트 어휘 메모 형식이 12가지였다).
 * 그래서 스키마를 API에 강제하고 검증된 객체를 받는다.
 */
export async function callStructured({
  apiKey,
  model = 'claude-sonnet-5',
  system,
  prompt,
  schema,
  maxTokens = 8000,
  signal,
}) {
  if (!apiKey) {
    throw new ClaudeError('API 키가 없습니다. 설정에서 입력해 주세요.', { status: 0 })
  }

  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // 브라우저에서 직접 호출하려면 필요하다.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema },
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ClaudeError(
      '네트워크에 연결할 수 없습니다. 인터넷 상태를 확인해 주세요.',
      { status: 0 }
    )
  }

  if (!response.ok) {
    let body = null
    try {
      body = await response.json()
    } catch {
      /* 본문이 JSON이 아닐 수 있다 */
    }
    throw new ClaudeError(describe(response.status, body), {
      status: response.status,
      type: body?.error?.type,
    })
  }

  const data = await response.json()

  // 안전장치가 요청을 거절하면 content가 비거나 부분만 온다.
  // content[0]을 무조건 읽으면 여기서 터진다.
  if (data.stop_reason === 'refusal') {
    throw new ClaudeError('요청이 안전 정책으로 거절되었습니다.', { status: 200 })
  }

  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) {
    throw new ClaudeError('응답이 비어 있습니다. 다시 시도해 주세요.', { status: 200 })
  }

  try {
    return { data: JSON.parse(text), usage: data.usage }
  } catch {
    throw new ClaudeError('응답을 해석할 수 없습니다. 다시 시도해 주세요.', {
      status: 200,
    })
  }
}

// ── 어휘 뜻풀이 보강 ────────────────────────────────────────────────
// 시트에 이미 있는 41개 메모의 스타일을 따른다: 한국어 뜻풀이 위주,
// 여러 뜻은 나열. 여기에 영영 정의를 더한다 — 노션 6챕터 프롬프트
// Ch3이 "영영사전풀이까지" 요구했는데 실제로는 못 채웠던 부분이다.

const VOCAB_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          lemma: { type: 'string', description: '사전 표제형' },
          meaningKo: { type: 'string', description: '한국어 뜻. 여러 뜻은 쉼표로' },
          definitionEn: { type: 'string', description: '쉬운 영영 정의 한 문장' },
          nuance: {
            type: 'string',
            description: '이 문맥에서의 뉘앙스. 사전적 의미와 다를 때만, 아니면 빈 문자열',
          },
        },
        required: ['term', 'lemma', 'meaningKo', 'definitionEn', 'nuance'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
}

const VOCAB_SYSTEM = `당신은 한국인 성인 학습자(목표 C1)를 가르치는 영어 교사입니다.
영화·드라마 대사에서 뽑은 표현의 뜻을 풀이합니다.

원칙:
- 한국어 뜻풀이를 먼저, 간결하게. 여러 뜻이 있으면 쉼표로 나열합니다.
- 영영 정의는 학습자가 읽을 수 있는 쉬운 영어 한 문장으로.
- 주어진 문맥에서 쓰인 뜻을 최우선으로 답합니다. 사전 1번 뜻이 아니라
  이 대사에서의 뜻입니다.
- 구어체·관용구·비유는 문자적 의미가 아니라 실제 쓰임을 설명합니다.
- nuance는 사전적 의미만으로 부족할 때만 채우고, 아니면 빈 문자열로 둡니다.
  없는 설명을 억지로 만들지 마세요.`

/**
 * 표현 목록의 뜻풀이를 한 번의 호출로 받는다.
 * @param {Array<{term: string, context: string}>} items
 */
export async function enrichVocab({ items, apiKey, model, signal }) {
  const list = items
    .map((it, i) => `${i + 1}. "${it.term}"\n   문맥: ${it.context}`)
    .join('\n')

  const { data, usage } = await callStructured({
    apiKey,
    model,
    system: VOCAB_SYSTEM,
    prompt: `다음 표현들의 뜻을 풀이해 주세요. 각 표현은 실제 대사에서 뽑은 것이고, 문맥을 함께 드립니다.\n\n${list}`,
    schema: VOCAB_SCHEMA,
    maxTokens: Math.min(600 * items.length + 1000, 16000),
    signal,
  })

  return { entries: data.entries ?? [], usage }
}

// ── 스크립트 해설 ───────────────────────────────────────────────────
// 노션 6챕터 프롬프트의 Ch1~4를 구조화한 것. Ch5~6(퀴즈·문장연습)은
// AI를 쓰지 않는다 — 이해도 문제는 여기서, 문장 연습은 시트 문장쌍에서.

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    chunks: {
      type: 'array',
      description: '구문별 분할 + 의역 (Ch1)',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' },
          ko: { type: 'string', description: '의역' },
          literal: { type: 'string', description: '직독직해' },
        },
        required: ['en', 'ko', 'literal'],
        additionalProperties: false,
      },
    },
    grammar: {
      type: 'array',
      description: '알아야 할 문법 (Ch2)',
      items: {
        type: 'object',
        properties: {
          point: { type: 'string', description: '문법 포인트 이름' },
          explanation: { type: 'string' },
          fromScript: { type: 'string', description: '스크립트에서 해당 문장' },
          example: { type: 'string', description: '온전한 문장 형태의 추가 예문' },
        },
        required: ['point', 'explanation', 'fromScript', 'example'],
        additionalProperties: false,
      },
    },
    background: {
      type: 'array',
      description: '이해에 필요한 배경지식 (Ch4)',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['topic', 'detail'],
        additionalProperties: false,
      },
    },
    comprehension: {
      type: 'array',
      description: '핵심 내용 확인 문제 5개 (Ch5)',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['chunks', 'grammar', 'background', 'comprehension'],
  additionalProperties: false,
}

const ANALYSIS_SYSTEM = `당신은 베테랑 영어 교사이자 전문 번역가입니다.
한국인 성인 학습자(목표 C1)가 영화 대사를 깊이 공부할 수 있도록 분석합니다.

원칙:
- 구문 분할은 의미 단위로 끊습니다. 문장을 통째로 두지 마세요.
- 직독직해는 영어 어순 그대로, 의역은 한국어로 자연스럽게. 둘 다 줍니다.
- 문법 설명의 예문은 반드시 온전한 문장 형태로 씁니다.
- 구어체 영화 대사입니다. 축약, 생략, 도치, 슬랭을 문어체 기준으로
  틀렸다고 하지 말고 실제 쓰임으로 설명하세요.
- 배경지식은 대사를 이해하는 데 실제로 필요한 것만. 잡학은 넣지 마세요.
- 이해도 문제는 세부 암기가 아니라 핵심 내용을 물어야 합니다.`

export async function analyzeScript({ title, script, apiKey, model, signal }) {
  return callStructured({
    apiKey,
    model,
    system: ANALYSIS_SYSTEM,
    prompt: `다음은 영화 "${title}"의 한 장면입니다. 분석해 주세요.\n\n${script}`,
    schema: ANALYSIS_SCHEMA,
    maxTokens: 16000,
    signal,
  })
}
