// 단어 난이도 판정.
//
// 하이라이트에는 `have`, `has`, `been`, `wouldn't` 같은 조동사 한 개짜리
// 표시가 섞여 있다. 읽다가 구문이 걸려서 그 자리를 표시한 것이지 그
// 단어를 몰라서가 아닌데, 카드로 만들면 "have = 가지다"가 되어 버린다.
// C1을 목표로 하는 성인에게 이런 카드는 시간 낭비다.
//
// 그래서 지우지 않고 가린다. 기본은 숨김이고 설정에서 켤 수 있다 —
// 본인이 표시한 자료라 임의로 없애면 안 된다.

/**
 * 초등~중학 기초 수준 단어. 기능어와 기본 동사·형용사 위주로,
 * 이 학습자가 카드로 볼 필요가 없는 것들만 골랐다.
 *
 * 여기 없는 단어는 통과시킨다. 목록을 크게 만들수록 정말 필요한
 * 단어까지 걸러내므로, 애매하면 넣지 않는 쪽을 택했다. 예를 들어
 * straight, mean, still은 문맥에 따라 뜻이 갈려서 제외하지 않았다.
 */
const BASIC = new Set(`
a an the this that these those there here
i you he she it we they me him her us them
my your his its our their mine yours ours theirs
myself yourself himself herself itself ourselves themselves
am is are was were be been being
do does did done doing
have has had having
will would shall should can could may might must
go goes went gone going come comes came coming
get gets got gotten getting
make makes made making take takes took taken taking
say says said saying tell tells told telling
know knows knew known knowing think thinks thought thinking
see sees saw seen seeing look looks looked looking
want wants wanted wanting need needs needed
give gives gave given put puts putting
find finds found use uses used using
feel feels felt work works worked
call calls called ask asks asked
try tries tried leave leaves left
like likes liked love loves loved
live lives lived play plays played
run runs ran walk walks walked
eat eats ate drink drinks drank
read reads write writes wrote
sit sits sat stand stands stood
open opens close closes start starts stop stops
help helps helped keep keeps kept
let lets turn turns turned
show shows showed hear hears heard
and or but so because if when while as than then
of in on at to for with from by about into over under
up down out off again very just too also only even
not no yes never always often sometimes usually
what which who whom whose where why how
all any both each few more most other some such
one two three four five six seven eight nine ten
first second last next new old good bad big small
long short high low right wrong same different
man woman boy girl child people person friend family
mother father parent brother sister baby
day night morning time year month week hour minute
home house room school work city country world place
water food money book word name thing way part
hand head eye face body life love work game
happy sad angry glad sorry nice fine okay
today tomorrow yesterday now soon late early
please thank hello goodbye
`.trim().split(/\s+/))

/** 축약형을 풀어 기초 판정에 쓴다. wouldn't → would */
function stripContraction(w) {
  return w
    .replace(/n['’]t$/i, '')
    .replace(/['’](s|re|ve|ll|d|m)$/i, '')
}

/**
 * 이 카드가 기초 수준이라 굳이 외울 필요가 없는가.
 *
 * 단어 하나짜리만 본다. 두 단어 이상이면 기초 단어의 조합이라도
 * 숙어일 수 있어서(get over, put on) 거른다면 손해가 크다.
 */
export function isBasicWord(card) {
  if (card.kind && card.kind !== 'word') return false

  const raw = (card.front ?? '').trim().toLowerCase()
  if (!raw) return true

  // 구두점만 있거나 한 글자면 학습 가치가 없다
  const cleaned = raw.replace(/^[^a-z']+|[^a-z']+$/g, '')
  if (cleaned.length <= 1) return true
  if (/\s/.test(cleaned)) return false

  return BASIC.has(cleaned) || BASIC.has(stripContraction(cleaned))
}

/** 덱에서 기초 단어를 걸러낸다. */
export function filterByLevel(cards, { hideBasic = true } = {}) {
  if (!hideBasic) return cards
  return cards.filter((c) => !isBasicWord(c))
}
