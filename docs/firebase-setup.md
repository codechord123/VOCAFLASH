# 개인 클라우드 동기화 (Firebase) 설정

앱의 기록은 브라우저(localStorage)에 산다. Firebase를 연결하면 그 사본이
내 Google 계정 아래 Firestore 문서 한 장으로 저장되고, 기기를 바꾸거나
브라우저를 지워도 이어진다. 앱 안 **설정 → 클라우드 동기화**에도 같은
안내가 있다.

## 1. Firebase 프로젝트 (한 번만)

1. <https://console.firebase.google.com> → **프로젝트 추가** (애널리틱스는 꺼도 됨)
2. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
   - 설정 탭 → **승인된 도메인**에 앱 주소 추가 (예: `vocaflash.vercel.app`)
3. **Firestore Database** → 데이터베이스 만들기
   - 위치: `asia-northeast3 (서울)`, 프로덕션 모드
   - **규칙** 탭에 아래를 붙여 넣고 게시 — 본인 계정만 자기 문서를 읽고 쓴다

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == uid;
    }
  }
}
```

4. 프로젝트 설정(⚙) → 내 앱 → **웹 앱 추가(</>)** → `firebaseConfig` 블록 복사

## 2. 앱에 연결

**방법 A (권장) — 앱에 붙여 넣기.** 설정 → 클라우드 동기화 → 붙여넣기 칸에
`firebaseConfig` 블록을 통째로 붙여 넣고 **저장하고 연결** → **Google로 로그인**.
기기마다 한 번씩 한다(폰, 노트북).

**방법 B — Vercel 환경변수.** 모든 기기에서 붙여넣기를 생략하려면 Vercel
프로젝트 설정 → Environment Variables에 넣고 다시 배포한다.

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

웹용 Firebase 설정값은 비밀이 아니다(브라우저에 그대로 실린다). 데이터를
지키는 것은 위의 보안 규칙이다.

## 동기화 방식

- 저장 위치: `users/{내 uid}/vocaflash/state` 문서 하나
- 열 때 받아서 병합 → 공부하는 동안 마지막 변경 4초 뒤 → 앱을 내리거나 다시 열 때
- 매번 **받아서 병합한 뒤 올린다** (`src/lib/merge.js`). 덮어쓰지 않는다:
  복습 진행은 더 많이 본 쪽, 회독은 더 많이 읽은 쪽, 일차는 더 멀리 간 쪽,
  기록은 합집합(중복 제거). 두 기기에서 번갈아 공부해도 어느 쪽도 잃지 않는다.
- 문서가 900KB를 넘으면 클라우드 사본에서만 오래된 복습 기록을 덜어 낸다
  (기기의 원본은 그대로)
- 무료 한도(하루 읽기 5만·쓰기 2만) 안에서 한 사람이 쓰기에 충분하다

## 문제가 생기면

| 메시지 | 할 일 |
|---|---|
| 이 주소가 Firebase에 등록되어 있지 않습니다 | Authentication → 설정 → 승인된 도메인에 앱 주소 추가 |
| Firestore 보안 규칙이 막고 있습니다 | 위 규칙을 붙여 넣고 **게시**했는지 확인 |
| Google 로그인이 꺼져 있습니다 | Authentication → 로그인 방법 → Google 사용 설정 |
| 홈 화면 앱에서 로그인 창이 안 뜸 | Safari로 한 번 열어 로그인 (리디렉트 방식으로 자동 전환되긴 하지만 iOS가 막을 때가 있다) |
