#!/usr/bin/env bash
# 问径 408 · 回滚脚本（H 包 / Alpha TD-09）
#
# 做的事：停止当前容器 → 用指定（默认最近一次）备份镜像重建 → 等待健康 →（可选）恢复前端静态资源
#         → 写回滚记录。
#
# 用法：
#   ./scripts/rollback.sh --list           # 列出可用备份镜像
#   ./scripts/rollback.sh                  # 回滚到最近一次 backup-* 镜像
#   ./scripts/rollback.sh --to wenjing-backend:backup-20261113-101500
#   ./scripts/rollback.sh --web-backup /opt/backup-web-20261113-101500.tgz
#   ./scripts/rollback.sh --dry-run
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/opt/wenjing/app}
WEBROOT=${WEBROOT:-/var/www/wenjing}
ENV_FILE=${ENV_FILE:-/opt/wenjing/backend.env}
STATE_DIR=${STATE_DIR:-/opt/wenjing/releases}
CONTAINER=${CONTAINER:-wenjing-backend}
HOST_PORT_MAP=${HOST_PORT_MAP:-127.0.0.1:8000:8000}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8000/api/health}
RESTART_POLICY=${RESTART_POLICY:-unless-stopped}

TO=""
WEB_BACKUP=""
DRY_RUN=0
ASSUME_YES=0
TS=$(date +%Y%m%d-%H%M%S)

log() { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback][ERROR] %s\n' "$*" >&2; exit 1; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO=${2:?}; shift 2 ;;
    --web-backup) WEB_BACKUP=${2:?}; shift 2 ;;
    --list)
      docker images --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep -E 'backup-' || echo "（无备份镜像）"
      exit 0 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --dry-run|-n) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done

[[ "$DRY_RUN" == "1" ]] || [[ $(id -u) -eq 0 ]] || fail "需要 root 执行（或加 --dry-run）"
[[ "$DRY_RUN" == "1" ]] || [[ -f "$ENV_FILE" ]] || fail "缺少环境变量文件：$ENV_FILE"

if [[ -z "$TO" ]]; then
  TO=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^wenjing-backend:backup-' | sort | tail -1)
  [[ -n "$TO" ]] || fail "没有找到 backup-* 镜像，请用 --to 指定"
fi
docker image inspect "$TO" >/dev/null 2>&1 || fail "镜像不存在：$TO"
log "回滚目标镜像：$TO"

if [[ "$ASSUME_YES" == "0" && "$DRY_RUN" == "0" ]]; then
  read -r -p "确认回滚到 $TO ？[y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || fail "已取消"
fi

log "重建容器 $CONTAINER"
run docker rm -f "$CONTAINER" || true
run docker run -d --name "$CONTAINER" --restart "$RESTART_POLICY" \
  -p "$HOST_PORT_MAP" \
  --env-file "$ENV_FILE" \
  -v "$APP_DIR/backend/data:/app/data" \
  "$TO"

if [[ "$DRY_RUN" == "0" ]]; then
  ok=0
  for _ in $(seq 1 45); do
    if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  [[ "$ok" == "1" ]] || fail "回滚后健康检查仍失败：$HEALTH_URL（请检查 docker logs $CONTAINER）"
  log "回滚后健康检查通过"
fi

if [[ -n "$WEB_BACKUP" ]]; then
  [[ -f "$WEB_BACKUP" ]] || fail "前端备份不存在：$WEB_BACKUP"
  log "恢复前端静态资源 ← $WEB_BACKUP"
  run rm -rf "$WEBROOT.restore"
  run mkdir -p "$WEBROOT.restore"
  run tar -xzf "$WEB_BACKUP" -C "$WEBROOT.restore" --strip-components=1
  run rsync -a --delete "$WEBROOT.restore/" "$WEBROOT/"
  run chown -R www-data:www-data "$WEBROOT"
  run rm -rf "$WEBROOT.restore"
fi

if [[ "$DRY_RUN" == "0" ]]; then
  mkdir -p "$STATE_DIR"
  RECORD=$STATE_DIR/rollback-$TS.txt
  {
    echo "rollback_time=$TS"
    echo "target_image=$TO"
    echo "web_backup=${WEB_BACKUP:-未恢复}"
    echo "health_json=$(curl -s -m 5 "$HEALTH_URL" || true)"
  } >"$RECORD"
  log "回滚记录：$RECORD"
fi

log "回滚完成：$TO"
