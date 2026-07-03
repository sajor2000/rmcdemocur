#!/usr/bin/env bash
# Discover Azure OpenAI / Foundry settings from a resource group and write .env.local
set -euo pipefail

RG="${1:-AI Innovation Foundry}"
ENV_FILE="${2:-.env.local}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install: brew install azure-cli && az login"
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Not logged in. Run: az login"
  exit 1
fi

echo "Searching resource group: $RG"

ACCOUNT_JSON=$(az cognitiveservices account list -g "$RG" --query "[?kind=='OpenAI' || kind=='AIServices' || contains(name, 'openai') || contains(name, 'foundry')]" -o json 2>/dev/null || echo "[]")

if [ "$ACCOUNT_JSON" = "[]" ] || [ -z "$ACCOUNT_JSON" ]; then
  echo "No OpenAI/AI Services account in '$RG'. Listing all cognitive accounts in group..."
  ACCOUNT_JSON=$(az cognitiveservices account list -g "$RG" -o json)
fi

ACCOUNT_NAME=$(echo "$ACCOUNT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['name'] if d else '')")
ACCOUNT_KIND=$(echo "$ACCOUNT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('kind','') if d else '')")

if [ -z "$ACCOUNT_NAME" ]; then
  echo "No Cognitive Services account found in resource group '$RG'."
  echo "Available resource groups:"
  az group list --query "[].name" -o tsv | head -20
  exit 1
fi

echo "Using account: $ACCOUNT_NAME (kind: $ACCOUNT_KIND)"

ENDPOINT=$(az cognitiveservices account show -g "$RG" -n "$ACCOUNT_NAME" --query "properties.endpoint" -o tsv)
API_KEY=$(az cognitiveservices account keys list -g "$RG" -n "$ACCOUNT_NAME" --query "key1" -o tsv)

DEPLOYMENTS=$(az cognitiveservices account deployment list -g "$RG" -n "$ACCOUNT_NAME" -o json)

CHAT_DEPLOY=$(echo "$DEPLOYMENTS" | python3 -c "
import json,sys
deps=json.load(sys.stdin)
chat=[]
for d in deps:
    m=(d.get('properties',{}).get('model',{}) or {})
    name=d.get('name','')
    model=(m.get('name') or '').lower()
    if 'gpt-4.1' in model or name.lower() == 'gpt-4.1':
        chat.insert(0, name)
    elif any(x in model for x in ['gpt-4','gpt-4o','gpt-35','o4','o3']):
        chat.append(name)
print(chat[0] if chat else '')
")

EMBED_DEPLOY=$(echo "$DEPLOYMENTS" | python3 -c "
import json,sys
deps=json.load(sys.stdin)
emb=[]
for d in deps:
    m=(d.get('properties',{}).get('model',{}) or {})
    name=d.get('name','')
    model=(m.get('name') or '').lower()
    if 'embed' in model:
        if 'large' in model or 'large' in name.lower():
            emb.insert(0, name)
        else:
            emb.append(name)
print(emb[0] if emb else '')
")

if [ -z "$CHAT_DEPLOY" ]; then
  CHAT_DEPLOY=$(echo "$DEPLOYMENTS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['name'] if d else '')")
fi
if [ -z "$EMBED_DEPLOY" ]; then
  EMBED_DEPLOY=$(echo "$DEPLOYMENTS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[1]['name'] if len(d)>1 else (d[0]['name'] if d else ''))")
fi

# Preserve existing DATABASE_URL if present
DATABASE_URL=""
if [ -f "$ENV_FILE" ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)
fi

cat > "$ENV_FILE" <<EOF
DATABASE_URL=${DATABASE_URL:-postgresql://user:pass@ep-xxx.neon.tech/rushmap?sslmode=require}
AZURE_OPENAI_ENDPOINT=${ENDPOINT%/}
AZURE_OPENAI_API_KEY=${API_KEY}
AZURE_OPENAI_DEPLOYMENT_CHAT=${CHAT_DEPLOY}
AZURE_OPENAI_DEPLOYMENT_EMBED=${EMBED_DEPLOY}
AZURE_OPENAI_EMBEDDING_DIMENSIONS=1536
AZURE_OPENAI_API_VERSION=2024-12-01-preview
EOF

echo ""
echo "Wrote $ENV_FILE"
echo "  Endpoint: $ENDPOINT"
echo "  Chat deployment: $CHAT_DEPLOY"
echo "  Embed deployment: $EMBED_DEPLOY"
echo ""
echo "Deployments in account:"
echo "$DEPLOYMENTS" | python3 -c "import json,sys; [print(f\"  - {d['name']}: {(d.get('properties',{}).get('model',{}) or {}).get('name','')}\") for d in json.load(sys.stdin)]"
echo ""
if [[ "$DATABASE_URL" == *"ep-xxx"* || -z "$DATABASE_URL" ]]; then
  echo "Still need DATABASE_URL (Neon). Run: npx neonctl connection-string --project-name rushmap"
fi
