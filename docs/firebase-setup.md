# 개인 클라우드 동기화 (Firebase) 설정

앱의 기록은 브라우저(localStorage)에 산다. Firebase에 연결하면 그 사본이
내 Google 계정 아래 Firestore 문서 한 장으로 저장되고, 기기를 바꾸거나
브라우저를 지워도 이어진다.

## 이 앱의 Firebase

주인의 기존 프로젝트 `to-do-cal-6e835`를 함께 쓴다(같은 프로젝트에 to-do-cal,
Spider20 앱이 있다). 웹 설정은 공개 값이라 `src/lib/cloud.js`에 내장되어
있어서, 기기마다 **설정 → 클라우드 동기화 → Google로 로그인**만 하면 된다.

이 앱이 쓰는 경로는 하나뿐이다:

```
users/{uid}/vocaflash/state
```

다른 앱의 경로(`users/{uid}/workouts/…`, `board/…`, to-do-cal의 경로)와 겹치지
않는다.

## 처음 한 번 — 콘솔에서 할 일 (다른 규칙은 건드리지 않는다)

1. **Authentication → 설정 → 승인된 도메인**에 이 앱의 주소를 추가
   (예: `vocaflash.vercel.app`). Google 로그인은 이미 켜져 있다(Spider20이 쓴다).
2. **Firestore Database → 규칙**: 지금 게시된 규칙을 **그대로 둔 채**, 맨 끝의
   닫는 괄호 두 개(`}` `}`) 바로 위에 아래 블록만 붙여 넣고 게시한다.

```
    // ───────────────────────────────────────────────
    // [vocaflash] 영어 공부 앱 — 본인 문서만, Google 로그인만
    // ───────────────────────────────────────────────
    match /users/{uid}/vocaflash/{docId} {
      allow read, write: if request.auth != null
        && request.auth.token.firebase.sign_in_provider == 'google.com'
        && request.auth.uid == uid;
    }
```

Firestore 규칙은 경로가 맞는 `match`들 중 하나라도 허용하면 허용이다. 이 블록은
`users/{uid}/vocaflash/` 아래에만 걸리므로 기존 앱이 쓰는 경로의 허용·거부는
그대로다.

## 다른 프로젝트를 쓰고 싶으면

설정 → 클라우드 동기화의 붙여넣기 칸(내장 설정보다 우선)이나 Vercel 환경변수
`VITE_FIREBASE_*`로 바꿀 수 있다.

## 동기화 방식

- 열 때 받아서 병합 → 공부하는 동안 마지막 변경 4초 뒤 → 앱을 내리거나 다시 열 때
- 매번 **받아서 병합한 뒤 올린다** (`src/lib/merge.js`). 덮어쓰지 않는다:
  복습 진행은 더 많이 본 쪽, 회독은 더 많이 읽은 쪽, 일차는 더 멀리 간 쪽,
  기록은 합집합(중복 제거). 두 기기에서 번갈아 공부해도 어느 쪽도 잃지 않는다.
- 문서가 900KB를 넘으면 클라우드 사본에서만 오래된 복습 기록을 덜어 낸다

## 문제가 생기면

| 메시지 | 할 일 |
|---|---|
| 이 주소가 Firebase에 등록되어 있지 않습니다 | Authentication → 설정 → 승인된 도메인에 앱 주소 추가 |
| Firestore 규칙이 막고 있습니다 | 위 블록을 규칙에 추가하고 **게시**했는지 확인 |
| 홈 화면 앱에서 로그인 창이 안 뜸 | Safari로 한 번 열어 로그인 |
