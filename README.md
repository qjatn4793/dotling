# Dotling

AI 픽셀아트 생성기. 이미지를 픽셀아트로 변환하거나, 텍스트 프롬프트로 픽셀아트를 생성한다.

## 기능

- **이미지 → 픽셀아트**: 사진/이미지를 업로드하면 원하는 해상도와 팔레트로 변환
- **텍스트 → 픽셀아트**: 프롬프트 입력으로 픽셀아트 캐릭터/오브젝트 생성 (ComfyUI 필요)
- 해상도 선택: 16×16 / 32×32 / 64×64
- 팔레트 선택: NES / Game Boy / 8색 / 16색 / 32색
- PNG 다운로드 (원본 해상도의 8× 업스케일)

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 |
| 이미지 처리 | Sharp |
| AI 추론 엔진 | ComfyUI |
| AI 모델 | Stable Diffusion 1.5 + PixelArtRedmond LoRA |

## 처리 방식

### 이미지 → 픽셀아트 (`POST /api/convert`)

외부 AI 없이 Sharp만으로 서버에서 처리한다.

```
원본 이미지
  → Lanczos3 커널로 목표 해상도(N×N)로 리사이즈
  → 팔레트 적용
      고정 팔레트 (NES / Game Boy):
        각 픽셀마다 유클리드 거리 기반 최근접 색상 매핑
      색상 수 기반 (8 / 16 / 32색):
        Sharp PNG 양자화 (dither 0.5)
  → Nearest-neighbor 커널로 8× 업스케일 (픽셀 경계 선명하게 유지)
  → PNG 반환
```

### 텍스트 → 픽셀아트 (`POST /api/generate`)

로컬에서 실행 중인 ComfyUI API를 호출한다.

```
프롬프트
  → ComfyUI에 워크플로우 JSON 전송 (POST /prompt)
  → 폴링으로 완료 대기 (GET /history/{id})
  → 완성된 512×512 이미지 수신
  → 이미지 → 픽셀아트와 동일한 파이프라인으로 픽셀화
  → PNG 반환
```

**ComfyUI 워크플로우 구성:**

```
CheckpointLoader (SD 1.5)
  → LoraLoader (PixelArtRedmond-Lite64, strength 0.85)
  → CLIPTextEncode (positive / negative)
  → KSampler (Euler, 20 steps, CFG 7.5)
  → VAEDecode
  → SaveImage
```

### 팔레트

| 팔레트 | 방식 | 색상 수 |
|--------|------|---------|
| NES | 고정 색상표 + 최근접 매핑 | 25색 |
| Game Boy | 고정 색상표 + 최근접 매핑 | 4색 |
| 8 / 16 / 32색 | Sharp PNG 양자화 | 가변 |

## 의존성

### dotling (Next.js)

```
next         ^16
react        ^19
sharp        ^0.34   — 이미지 처리
typescript   ^5
tailwindcss  ^4
```

### ComfyUI (로컬 AI 서버)

```
Python       3.12
PyTorch      2.11  (MPS 백엔드, Apple Silicon)
ComfyUI      최신 main 브랜치

모델 파일 (models/ 폴더):
  checkpoints/v1-5-pruned-emaonly.safetensors   ~4 GB
  loras/PixelArtRedmond-Lite64.safetensors      ~150 MB
```

## 시작하기

### 1. 저장소 클론

```bash
git clone <repo>
cd dotling
npm install
```

### 2. ComfyUI 설치 (텍스트 생성 기능 사용 시)

dotling과 형제 디렉토리에 설치해야 한다.

```
IdeaProjects/
  dotling/     ← Next.js 앱
  ComfyUI/     ← AI 서버 (형제 디렉토리여야 함)
```

```bash
cd ..
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Python 3.12 가상환경
pyenv install 3.12.10
~/.pyenv/versions/3.12.10/bin/python3.12 -m venv venv

# PyTorch (Apple Silicon MPS)
venv/bin/pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
venv/bin/pip install mako regex trampoline
venv/bin/pip install "transformers==4.50.3"

# 모델 다운로드 (~4.2 GB)
venv/bin/python3.12 -c "
from huggingface_hub import hf_hub_download
hf_hub_download('runwayml/stable-diffusion-v1-5',
  'v1-5-pruned-emaonly.safetensors',
  local_dir='models/checkpoints')
hf_hub_download('artificialguybr/PixelArtRedmond',
  'PixelArtRedmond-Lite64.safetensors',
  local_dir='models/loras')
"
```

### 3. 환경변수 (선택)

기본값으로 동작하므로 설정하지 않아도 된다.
원격 ComfyUI를 쓰거나 포트를 바꾼 경우에만 `.env.local`을 만든다.

```bash
cp .env.example .env.local
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `COMFYUI_URL` | `http://localhost:8188` | 텍스트 → 픽셀아트 생성에 사용하는 ComfyUI API 주소 |

### 4. 실행

```bash
cd dotling
npm run dev
```

`npm run dev` 하나로 ComfyUI와 Next.js가 함께 시작된다.
`Ctrl+C`로 종료하면 두 서버가 함께 내려간다.

ComfyUI가 없으면 자동으로 감지해서 Next.js만 실행한다 (이미지 변환 기능은 정상 동작).

## 성능 (Apple M4 16GB 기준)

| 작업 | 소요 시간 |
|------|-----------|
| 이미지 → 픽셀아트 | < 1초 |
| 텍스트 → 픽셀아트 (MPS) | ~36초 |
| 텍스트 → 픽셀아트 (CPU) | ~120초 |
