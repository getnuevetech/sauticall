#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="${LIGHTSAIL_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
NAME="${LIGHTSAIL_INSTANCE:-sauticall}"
STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP:-sauticall-ip}"

if ! command -v aws >/dev/null 2>&1; then
  echo "The AWS CLI is not installed."
  exit 1
fi

aws lightsail get-instance \
  --region "${REGION}" \
  --instance-name "${NAME}" \
  --query 'instance.{name:name,state:state.name,blueprint:blueprintName,bundle:bundleId,publicIp:publicIpAddress,zone:location.availabilityZone}' \
  --output table

aws lightsail get-static-ip \
  --region "${REGION}" \
  --static-ip-name "${STATIC_IP_NAME}" \
  --query 'staticIp.{name:name,ip:ipAddress,attached:isAttached,instance:attachedTo}' \
  --output table

aws lightsail get-instance-port-states \
  --region "${REGION}" \
  --instance-name "${NAME}" \
  --query 'portStates[].{from:fromPort,to:toPort,protocol:protocol,state:state}' \
  --output table

if [[ -f "${ROOT}/deploy/lightsail/keys/instance.txt" ]]; then
  echo "Saved setup:"
  cat "${ROOT}/deploy/lightsail/keys/instance.txt"
fi
