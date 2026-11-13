#!/usr/bin/env bash
# 问径 408 · 发布脚本（H 包 / Alpha TD-09）
#
# 做的事：备份旧版本 →（可选）构建后端镜像 → 重建后端容器 → 等待健康 →（可选）发布前端静态资源
#         → 线上自检 → 写发布记录。
#
# 前置：仓库已在 APP_DIR 检出到候选 commit；ENV_FILE 已存在（见 docs/release.md 第五节）。
#
# 用法：
#   ./scripts/deploy.sh                     # 用当前 APP_DIR 的 HEAD 发布后端
#   ./scripts/deploy.sh --commit 4705d33    # 指定候选 commit（先 git -C APP_DIR checkout）
#   ./scripts/deploy.sh --frontend          # 同时构建并发布前端静态资源
#   ./scripts/deploy.sh --dry-run           # 只打印将执行的命令，不改动线上
#
# 环境变量覆盖（演练时用）：APP_DIR / WEBROOT / ENV_FILE / STATE_DIR / CONTAINER /
#   HOST_PORT_MAP / HEALTH_URL / PUBLIC_BASE / PIP_INDEX_URL / NPM_REGISTRY / RESTART_POLICY
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/wenjing/app}
WEBROOT=${WEBROOT:-/var/www/wenjing}
ENV_FILE=${ENV_FILE:-/opt/wenjing/backend.env}
STATE_DIR=${STATE_DIR:-/opt/wenjing/releases}
CONTAINER=${CONTAINER:-wenjing-backend}
HOST_PORT_MAP=${HOST_PORT_MAP:-127.0.0.1:8000:8000}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8000/api/health}
PUBLIC_BASE=${PUBLIC_BASE:-http://127.0.0.1}
PIP_INDEX_URL=${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}
NPM_REGISTRY=${NPM_REGISTRY:-https://registry.npmjs.org}
RESTART_POLICY=${RESTART_POLICY:-unless-stopped}

COMMIT=""
IMAGE=""
WITH_FRONTEND=0
DRY_RUN=0
SKIP_BACKUP=0
TS=$(date +%Y%m%d-%H%M%S)

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy][ERROR] %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT=${2:?}; shift 2 ;;
    --image) IMAGE=${2:?}; shift 2 ;;
    --frontend) WITH_FRONTEND=1; shift ;;
    --dry-run|-n) DRY_RUN=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    -h|--help) usage ;;
    *) fail "未知参数：$1（--help 查看用法）" ;;
  esac
done

wait_health() {
  local tries=${1:-45}
  for _ in $(seq 1 "$tries"); do
    if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# ===== 0. 预检 =====
[[ "$DRY_RUN" == "1" ]] || [[ $(id -u) -eq 0 ]] || fail "需要 root 执行（或加 --dry-run 先看命令）"
for bin in docker curl; do command -v "$bin" >/dev/null || fail "缺少命令：$bin"; done
[[ "$DRY_RUN" == "1" ]] || [[ -f "$ENV_FILE" ]] || fail "缺少环境变量文件：$ENV_FILE（见 docs/release.md 第五节）"
[[ -d "$APP_DIR" ]] || fail "APP_DIR 不存在：$APP_DIR"

IS_GIT=0
if git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1; then IS_GIT=1; fi

if [[ -n "$COMMIT" ]]; then
  if [[ "$IS_GIT" == "1" ]]; then
    log "切换候选 commit：$COMMIT"
    run git -C "$APP_DIR" checkout --quiet "$COMMIT"
  else
    log "非 git 目录，跳过 checkout，仅把 $COMMIT 作为版本标签记录"
  fi
fi

if [[ "$IS_GIT" == "1" ]]; then
  SHORT=$(git -C "$APP_DIR" rev-parse --short HEAD)
  SUBJECT=$(git -C "$APP_DIR" log -1 --format='%s' HEAD)
else
  [[ -n "$COMMIT" ]] || fail "APP_DIR 不是 git 仓库，请用 --commit <sha/标签> 显式指定被发布的版本"
  SHORT=$COMMIT
  SUBJECT="(非 git 目录，版本标签由 --commit 指定)"
fi
log "候选版本：$SHORT ($SUBJECT)"

BACKEND_IMAGE=${IMAGE:-wenjing-backend:$SHORT}
mkdir -p "$STATE_DIR"

# ===== 1. 构建后端镜像 =====
if [[ -n "$IMAGE" ]]; then
  log "跳过构建，使用指定镜像：$BACKEND_IMAGE"
elif docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
  log "镜像已存在：$BACKEND_IMAGE"
else
  log "构建后端镜像：$BACKEND_IMAGE（pip 源 $PIP_INDEX_URL）"
  run docker build --build-arg "PIP_INDEX_URL=$PIP_INDEX_URL" -t "$BACKEND_IMAGE" "$APP_DIR/backend"
fi

# ===== 2. 备份当前版本 =====
WEB_BACKUP=""
BACKUP_TAG=""
if [[ "$SKIP_BACKUP" == "0" ]]; then
  if CURRENT_IMAGE_ID=$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null); then
    BACKUP_TAG="wenjing-backend:backup-$TS"
    log "备份当前镜像 → $BACKUP_TAG"
    run docker tag "$CURRENT_IMAGE_ID" "$BACKUP_TAG"
  else
    log "未发现运行中的 $CONTAINER，跳过镜像备份"
  fi
  if [[ -d "$WEBROOT" ]]; then
    WEB_BACKUP=/opt/backup-web-$TS.tgz
    log "备份前端静态资源 → $WEB_BACKUP"
    run tar -czf "$WEB_BACKUP" -C "$(dirname "$WEBROOT")" "$(basename "$WEBROOT")"
  fi
fi

# ===== 3. 重建后端容器 =====
log "重建容器 $CONTAINER（$BACKEND_IMAGE）"
if [[ "$DRY_RUN" == "1" ]]; then
  printf '[dry-run] docker rm -f %s\n' "$CONTAINER"
else
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
fi
run docker run -d --name "$CONTAINER" --restart "$RESTART_POLICY" \
  -p "$HOST_PORT_MAP" \
  --env-file "$ENV_FILE" \
  -v "$APP_DIR/backend/data:/app/data" \
  "$BACKEND_IMAGE"

if [[ "$DRY_RUN" == "0" ]]; then
  if ! wait_health 45; then
    log "健康检查失败：$HEALTH_URL"
    if [[ -n "$BACKUP_TAG" ]]; then
      log "自动回滚到 $BACKUP_TAG"
      CONTAINER="$CONTAINER" HOST_PORT_MAP="$HOST_PORT_MAP" HEALTH_URL="$HEALTH_URL" \
        ENV_FILE="$ENV_FILE" APP_DIR="$APP_DIR" \
        "$(dirname "$0")/rollback.sh" --to "$BACKUP_TAG" --yes || true
    fi
    fail "发布失败，已尝试回滚；请查看 docker logs $CONTAINER"
  fi
  log "后端健康检查通过"
fi

# ===== 4. 前端静态资源（可选） =====
FRONTEND_NOTE="未发布（--frontend 未启用）"
if [[ "$WITH_FRONTEND" == "1" ]]; then
  FRONTEND_IMAGE=wenjing-frontend:$SHORT
  log "构建前端镜像：$FRONTEND_IMAGE"
  run docker build --build-arg "NPM_REGISTRY=$NPM_REGISTRY" -t "$FRONTEND_IMAGE" "$APP_DIR/frontend"
  STAGING=$WEBROOT.new
  log "从镜像提取 dist 并替换 $WEBROOT"
  run rm -rf "$STAGING"
  run mkdir -p "$STAGING"
  run docker create --name wenjing-frontend-export "$FRONTEND_IMAGE"
  run docker cp wenjing-frontend-export:/usr/share/nginx/html/. "$STAGING/"
  run docker rm -f wenjing-frontend-export
  run rsync -a --delete "$STAGING/" "$WEBROOT/"
  run chown -R www-data:www-data "$WEBROOT"
  FRONTEND_NOTE="已发布（$FRONTEND_IMAGE）"
fi

# ===== 5. 线上自检 =====
health_json=$(curl -s -m 5 "$HEALTH_URL" || true)
recommend_code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "$PUBLIC_BASE/api/recommend" \
  -H 'Content-Type: application/json' \
  -d '{"question_id":"COP006","done_question_ids":[],"top_k":3}' || true)
question_code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$PUBLIC_BASE/api/question/COP006" || true)

# ===== 6. 写发布记录 =====
RECORD=$STATE_DIR/release-$TS.txt
if [[ "$DRY_RUN" == "1" ]]; then
  log "dry-run：不写记录（$RECORD）"
else
  {
    echo "release_time=$TS"
    echo "commit=$SHORT"
    echo "commit_subject=$SUBJECT"
    echo "backend_image=$BACKEND_IMAGE"
    echo "frontend=$FRONTEND_NOTE"
    echo "backup_image=$BACKUP_TAG"
    echo "web_backup=$WEB_BACKUP"
    echo "recommend_status=$recommend_code"
    echo "question_status=$question_code"
    echo "health_json=$health_json"
  } >"$RECORD"
  log "发布记录：$RECORD"
fi

log "完成：commit=$SHORT recommend=$recommend_code question=$question_code"
printf '%s\n' "$health_json"
