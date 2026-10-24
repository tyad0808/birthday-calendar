# 가족 생일 캘린더

가족 생일을 양력·음력으로 한 번 등록하면 매년 양력 날짜로 보여 주고, 휴대폰 캘린더(.ics)에 알림과 함께 넣을 수 있는 PWA.

```bash
npm install
npm run dev      # 개발 서버 (같은 와이파이의 휴대폰에서도 접속 가능)
npm test         # 변환·알림·ICS 테스트
npm run build    # dist/ 에 정적 파일 생성 → 아무 정적 호스팅에 올리면 끝
```

## 구조
| 파일 | 역할 |
|---|---|
| `src/convert.js` | 음력→양력 변환(KASI 기준 `korean-lunar-calendar`), 윤달·30일·2월 29일 처리, 2050년 한도 |
| `src/dates.js` | KST 오늘 날짜, 날짜 계산·표시 |
| `src/alerts.js` | 알림 단계, 앱 내 팝업 대상 계산·문구 |
| `src/ics.js` | .ics 생성 (종일 일정, VALARM, 사람+연도 고정 UID) |
| `src/storage.js` | localStorage 저장, 백업/복원 |
| `src/main.js`, `src/style.css` | UI |
| `public/sw.js`, `public/manifest.webmanifest` | 오프라인·홈 화면 추가 |

## 배포
`dist/` 폴더를 GitHub Pages, Netlify, Cloudflare Pages 등에 올린다. 서비스 워커와 홈 화면 추가는 **HTTPS**에서만 동작한다.
