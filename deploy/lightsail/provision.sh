#!/usr/bin/env bash
# Create the Lightsail server. This does not copy or start SautiCall.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="${LIGHTSAIL_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
NAME="${LIGHTSAIL_INSTANCE:-sauticall}"
BUNDLE="${LIGHTSAIL_BUNDLE:-small_3_0}"
BLUEPRINT="${LIGHTSAIL_BLUEPRINT:-ubuntu_24_04}"
AZ="${LIGHTSAIL_AZ:-${REGION}a}"
KEY_NAME="${LIGHTSAIL_KEY_NAME:-sauticall}"
STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP:-sauticall-ip}"
KEY_DIR="${ROOT}/deploy/lightsail/keys"
KEY_FILE="${KEY_DIR}/${KEY_NAME}.pem"

if ! command -v aws >/dev/null 2>&1; then
  echo "The AWS CLI is not installed. Install AWS CLI v2, then run this script again."
  exit 1
fi

if ! aws sts get-caller-identity --region "${REGION}" >/dev/null 2>&1; then
  echo "AWS credentials are not configured for region ${REGION}."
  echo "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_DEFAULT_REGION, then rerun deploy/lightsail/provision.sh."
  exit 1
fi

mkdir -p "${KEY_DIR}"
chmod 700 "${KEY_DIR}"

if aws lightsail get-key-pair --key-pair-name "${KEY_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  if [[ ! -f "${KEY_FILE}" ]]; then
    echo "Lightsail already has key pair ${KEY_NAME}, and ${KEY_FILE} is missing."
    echo "The private key is only returned when the key pair is created. Create a new name with LIGHTSAIL_KEY_NAME."
    exit 1
  fi
else
  aws lightsail create-key-pair --key-pair-name "${KEY_NAME}" --region "${REGION}" --query 'privateKeyBase64' --output text \
    | base64 --decode > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
fi

if ! aws lightsail get-instance --instance-name "${NAME}" --region "${REGION}" >/dev/null 2>&1; then
  if ! aws lightsail create-instances \
    --region "${REGION}" \
    --instance-names "${NAME}" \
    --availability-zone "${AZ}" \
    --blueprint-id "${BLUEPRINT}" \
    --bundle-id "${BUNDLE}" \
    --key-pair-name "${KEY_NAME}" \
    --user-data "file://${ROOT}/deploy/lightsail/cloud-init.yaml"; then
    echo "Instance creation failed. Ubuntu blueprints in ${REGION}:"
    aws lightsail get-blueprints --region "${REGION}" --query "blueprints[?contains(blueprintId, 'ubuntu')].blueprintId" --output text || true
    echo "Bundles in ${REGION}:"
    aws lightsail get-bundles --region "${REGION}" --query "bundles[?isActive].bundleId" --output text || true
    exit 1
  fi
fi

echo "Waiting for ${NAME} to reach running."
for _ in $(seq 1 60); do
  state="$(aws lightsail get-instance --instance-name "${NAME}" --region "${REGION}" --query 'instance.state.name' --output text)"
  if [[ "${state}" == "running" ]]; then
    break
  fi
  sleep 10
done
if [[ "${state}" != "running" ]]; then
  echo "Instance ${NAME} is ${state}. Check the Lightsail console before continuing."
  exit 1
fi

if ! aws lightsail get-static-ip --static-ip-name "${STATIC_IP_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  aws lightsail allocate-static-ip --static-ip-name "${STATIC_IP_NAME}" --region "${REGION}"
fi

attached="$(aws lightsail get-static-ip --static-ip-name "${STATIC_IP_NAME}" --region "${REGION}" --query 'staticIp.isAttached' --output text)"
if [[ "${attached}" != "True" && "${attached}" != "true" ]]; then
  aws lightsail attach-static-ip --static-ip-name "${STATIC_IP_NAME}" --instance-name "${NAME}" --region "${REGION}"
fi

aws lightsail put-instance-public-ports \
  --region "${REGION}" \
  --instance-name "${NAME}" \
  --port-infos \
    "fromPort=22,toPort=22,protocol=tcp" \
    "fromPort=80,toPort=80,protocol=tcp" \
    "fromPort=443,toPort=443,protocol=tcp"

ip="$(aws lightsail get-static-ip --static-ip-name "${STATIC_IP_NAME}" --region "${REGION}" --query 'staticIp.ipAddress' --output text)"
cat > "${KEY_DIR}/instance.txt" <<EOF
name=${NAME}
region=${REGION}
static_ip=${ip}
key=${KEY_FILE}
EOF
chmod 600 "${KEY_DIR}/instance.txt"

echo "Lightsail server is up. Cloud-init is cloning https://github.com/getnuevetech/sauticall.git into /opt/sauticall."
echo "Static IP: ${ip}"
echo "SSH: ssh -i ${KEY_FILE} ubuntu@${ip}"
echo "After a few minutes, open the Lightsail browser SSH session and run deploy/lightsail/bootstrap.sh with ADMIN_EMAIL and ADMIN_PASSWORD."
