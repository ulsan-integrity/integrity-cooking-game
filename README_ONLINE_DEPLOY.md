# 청렴한 한끼 — 온라인 배포형

이 폴더는 GitHub Pages, Netlify, Vercel 등 정적 웹호스팅에 바로 배포할 수 있습니다.

## 주요 파일
- `index.html`: 온라인 접속 시작 파일
- `manifest.webmanifest`: 모바일 홈 화면 설치 정보
- `sw.js`: 오프라인 캐시 서비스 워커
- `.github/workflows/deploy-pages.yml`: GitHub Pages 자동 배포
- `청렴한_한끼_앱.html`: PC에서 더블클릭하는 단일 HTML 버전

## GitHub Pages 배포
1. 이 폴더의 모든 파일을 GitHub 저장소 최상위에 업로드합니다.
2. 저장소 `Settings > Pages`로 이동합니다.
3. `Source`에서 `GitHub Actions`를 선택합니다.
4. `main` 브랜치에 push하면 자동 배포됩니다.
5. Actions 완료 후 `https://사용자명.github.io/저장소명/`으로 접속합니다.

## 중요
현재 랭킹은 사용자의 브라우저 `localStorage`에 저장됩니다. 따라서 다른 PC·휴대전화와 랭킹이 자동 공유되지는 않습니다. 전체 사용자 공용 랭킹에는 Firebase, Supabase 등 온라인 데이터베이스 연동이 별도로 필요합니다.


## v14 이미지 표시 오류 수정
- 화면에 사용하는 마스코트와 로고는 `index.html` 내부에도 포함되어 경로 누락 시에도 표시됩니다.
- GitHub에는 ZIP 내부의 파일과 폴더 전체를 그대로 업로드해야 합니다.
- 기존 버전이 보이면 브라우저를 새로고침하거나 사이트 데이터를 한 번 삭제하세요. 서비스워커 캐시는 v14에서 자동 교체됩니다.
