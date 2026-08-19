#!/bin/sh
set -eu

root_user="$(cat /run/secrets/minio_root_access_key)"
root_password="$(cat /run/secrets/minio_root_secret_key)"
media_user="$(cat /run/secrets/minio_media_access_key)"
media_password="$(cat /run/secrets/minio_media_secret_key)"

mc alias set fuze http://minio:9000 "$root_user" "$root_password"
mc mb --ignore-existing "fuze/${MINIO_BUCKET}"
cat >/tmp/media-policy.json <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],"Resource":["arn:aws:s3:::${MINIO_BUCKET}","arn:aws:s3:::${MINIO_BUCKET}/*"]}]}
EOF
mc admin policy create fuze fuze-media /tmp/media-policy.json >/dev/null 2>&1 || true
mc admin user add fuze "$media_user" "$media_password" >/dev/null 2>&1 || true
mc admin policy attach fuze fuze-media --user "$media_user"
