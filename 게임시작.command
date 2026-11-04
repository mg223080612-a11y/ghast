#!/bin/bash
# ==============================================================
#  가스트 사격 실행기 (맥) — 게임시작.bat 의 맥 버전
#  더블클릭하면
#   1) 게임 서버(serve.cjs)를 이 터미널 창에서 켜고 (랭킹은 Cloudflare 온라인 DB 에 저장)
#   2) Chrome(없으면 Edge)을 전체화면으로 열어 게임을 띄웁니다.
#  게임을 끝낼 때: 브라우저는 Cmd+Q, 서버는 이 터미널 창을 닫으세요 (또는 Ctrl+C).
#  서버가 켜져 있는 동안은 맥 화면이 꺼지지 않습니다 (caffeinate).
#  더블클릭해도 안 열리면: 터미널에서  chmod +x 게임시작.command
# ==============================================================
cd "$(dirname "$0")" || exit 1
URL="http://localhost:5190"
# 터미널을 Node.js 설치 경로를 모르는 채로 열었을 때를 위해 (Homebrew·공식 설치 위치)
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

fail() {
  echo
  echo " [오류] $1"
  echo
  read -r -p " Enter 를 누르면 창이 닫힙니다..."
  exit 1
}

server_up() { curl -s -o /dev/null "$URL"; }

# ---- Node.js 확인 ----
command -v node >/dev/null 2>&1 \
  || fail "Node.js 가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요."

# ---- 서버가 이미 켜져 있지 않으면 켜기 ----
SERVER_PID=""
if ! server_up; then
  echo " 게임 서버를 켜는 중..."
  node serve.cjs &
  SERVER_PID=$!
  # 이 창을 닫거나 Ctrl+C 를 누르면 바로 끝내고(서버 기다리는 중이어도), 끝날 때 서버도 같이 끈다
  trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
  trap 'exit 1' INT TERM HUP
fi

# ---- 서버가 응답할 때까지 최대 15초 기다리기 ----
TRIES=0
until server_up; do
  TRIES=$((TRIES + 1))
  [ "$TRIES" -ge 15 ] && fail "서버가 켜지지 않았습니다. 위에 나온 오류 메시지를 확인하세요."
  sleep 1
done
echo " 서버 준비 완료: $URL"

# ---- 브라우저 찾기 (Chrome → Edge) ----
if [ -z "$GHAST_NO_BROWSER" ]; then
  BROWSER=""
  for APP in "/Applications/Google Chrome.app" "$HOME/Applications/Google Chrome.app" \
             "/Applications/Microsoft Edge.app" "$HOME/Applications/Microsoft Edge.app"; do
    if [ -d "$APP" ]; then BROWSER="$APP"; break; fi
  done

  if [ -z "$BROWSER" ]; then
    echo " Chrome/Edge 를 찾지 못해 기본 브라우저로 엽니다. F 키를 눌러 전체화면으로 바꾸세요."
    open "$URL"
  else
    # 게임 전용 프로필로 열어야 전체화면·소리 옵션이 항상 적용됩니다 (평소 쓰는 Chrome 과 분리).
    # 맥 Chrome 은 --start-fullscreen 을 무시해서 --kiosk 로 전체화면으로 연다 (끄기: Cmd+Q)
    open -na "$BROWSER" --args --user-data-dir="$PWD/data/browser-profile" --app="$URL" \
      --kiosk --autoplay-policy=no-user-gesture-required --no-first-run \
      --no-default-browser-check --disable-pinch --overscroll-history-navigation=0
  fi
fi

# 서버를 다른 창에서 이미 켜 두었으면 여기서 끝
[ -z "$SERVER_PID" ] && exit 0

echo
echo " ── 이 창은 게임 서버입니다. 게임하는 동안 닫지 마세요 (최소화는 괜찮아요). ──"
echo
# 서버가 켜져 있는 동안 화면이 꺼지거나 잠들지 않게
caffeinate -dis -w "$SERVER_PID" &
wait "$SERVER_PID"
