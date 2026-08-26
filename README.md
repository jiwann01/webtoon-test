# 웹툰 화별 보기 테스트 앱

로컬에서 PDF를 불러오는 브라우저 보안 정책 때문에 `index.html`을 직접 더블클릭하지 말고, 이 폴더에서 정적 서버로 실행하세요.

```powershell
python -m http.server 8080
```

그다음 `http://localhost:8080`을 엽니다. PDF 파일 교체 또는 외부 저장소 URL 전환은 `app.js`의 `episodes` 목록에서만 관리합니다.
