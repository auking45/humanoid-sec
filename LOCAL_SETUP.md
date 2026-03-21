# 로컬 환경 실행 가이드 (Local Setup Guide)

이 문서는 본 애플리케이션을 사용자의 로컬 컴퓨터에서 설치하고 실행하는 방법을 안내합니다.

## 1. 사전 준비 사항 (Prerequisites)

시스템에 다음 소프트웨어가 설치되어 있어야 합니다:

*   **Node.js**: v18 이상 (최신 LTS 버전 권장)
*   **npm**: Node.js 설치 시 함께 설치됩니다.

## 2. 프로젝트 설치 (Installation)

1.  프로젝트 파일을 로컬 디렉토리에 다운로드하거나 복제합니다.
2.  터미널(또는 명령 프롬프트)을 열고 프로젝트 루트 디렉토리로 이동합니다.
3.  필요한 패키지를 설치합니다:
    ```bash
    npm install
    ```

## 3. 환경 설정 (Environment Variables)

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 입력합니다. (기본적으로 SQLite를 사용하도록 설정되어 있습니다.)

```env
# 데이터베이스 타입 설정 ('sqlite' 또는 'postgres')
DB_TYPE=sqlite

# PostgreSQL 사용 시에만 필요 (DB_TYPE=postgres 인 경우)
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# (선택 사항) API 키 설정
# GEMINI_API_KEY=your_api_key_here
```

## 4. 애플리케이션 실행 (Running the App)

개발 모드로 서버와 클라이언트를 동시에 실행합니다:

```bash
npm run dev
```

실행이 완료되면 브라우저에서 다음 주소로 접속할 수 있습니다:
*   **URL**: [http://localhost:3000](http://localhost:3000)

## 5. 데이터베이스 관리 (Database Management)

### SQLite 사용 시 (기본값)
*   별도의 설치가 필요 없습니다.
*   앱을 처음 실행하면 `database.sqlite` 파일이 자동으로 생성되고 초기 데이터가 채워집니다.

### PostgreSQL 사용 시
1.  로컬 또는 외부 PostgreSQL 서버가 준비되어 있어야 합니다.
2.  `.env` 파일에서 `DB_TYPE=postgres`로 변경합니다.
3.  `DATABASE_URL`에 본인의 DB 연결 정보를 입력합니다.
4.  앱을 실행하면 자동으로 테이블이 생성되고 초기 데이터가 마이그레이션됩니다.

## 6. 프로덕션 빌드 (Production Build)

실제 서비스 환경을 위해 빌드하고 실행하려면 다음 명령어를 사용합니다:

```bash
# 빌드 (dist 폴더 생성)
npm run build

# 실행
npm start
```

---
**주의**: 로컬 실행 시 포트 3000번이 이미 사용 중인지 확인해 주세요.
