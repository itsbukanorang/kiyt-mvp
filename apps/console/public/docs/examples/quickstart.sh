#!/usr/bin/env bash
set -Eeuo pipefail

: "${KIYT_API_KEY:?Set KIYT_API_KEY first}"
KIYT_BASE_URL="${KIYT_BASE_URL:-https://console.kiyt.io/api/v1}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

suffix="$(date +%s)-$$"
run_key="quickstart-run-$suffix"

create_payload="$(
  jq -n '{
    objective: "Confirm whether order ORD-1007 is ready to dispatch. Use the available order lookup before completing.",
    context: {order_id: "ORD-1007"},
    available_actions: [{
      name: "lookup_order",
      description: "Look up the current state of an order.",
      input_schema: {
        type: "object",
        properties: {order_id: {type: "string"}},
        required: ["order_id"],
        additionalProperties: false
      }
    }]
  }'
)"

create="$(
  curl --fail-with-body -sS \
    -X POST "$KIYT_BASE_URL/runs" \
    -H "Authorization: Bearer $KIYT_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $run_key" \
    --data-binary "$create_payload"
)"

run_id="$(jq -er '.run_id' <<<"$create")"
echo "Created $run_id"

get_run() {
  curl --fail-with-body -sS \
    "$KIYT_BASE_URL/runs/$run_id" \
    -H "Authorization: Bearer $KIYT_API_KEY"
}

poll_ready() {
  local attempt response status

  for attempt in $(seq 1 30); do
    response="$(get_run)"
    status="$(jq -r '.run.status' <<<"$response")"

    case "$status" in
      queued|running)
        sleep 2
        ;;
      requires_action|needs_input|completed|failed)
        printf '%s' "$response"
        return 0
        ;;
      *)
        echo "Unexpected run status: $status" >&2
        return 1
        ;;
    esac
  done

  echo "Timed out waiting for KIYT run" >&2
  return 1
}

for cycle in $(seq 1 8); do
  run_json="$(poll_ready)"
  status="$(jq -r '.run.status' <<<"$run_json")"

  case "$status" in
    completed)
      echo "$run_json" | jq '.run'
      echo "Run completed."
      exit 0
      ;;

    failed)
      echo "$run_json" | jq '.run.error'
      echo "Run failed." >&2
      exit 1
      ;;

    requires_action)
      decision_id="$(jq -er '.run.decision.decision_id' <<<"$run_json")"
      action_name="$(jq -er '.run.decision.action.name' <<<"$run_json")"
      arguments="$(jq -c '.run.decision.action.arguments' <<<"$run_json")"

      if [[ "$action_name" != "lookup_order" ]]; then
        echo "Refusing unknown action: $action_name" >&2
        exit 1
      fi

      order_id="$(jq -er '.order_id | select(type == "string" and length > 0)' <<<"$arguments")"

      # Customer-owned fixture tool. Replace this block with your real function.
      tool_output="$(
        jq -n --arg order_id "$order_id" '{
          order_id: $order_id,
          status: "packed",
          dispatch_ready: true
        }'
      )"

      observation_id="quickstart-observation-$suffix-$cycle"
      observation_payload="$(
        jq -n \
          --arg decision_id "$decision_id" \
          --arg observation_id "$observation_id" \
          --argjson output "$tool_output" \
          '{
            decision_id: $decision_id,
            observation_id: $observation_id,
            result: {status: "success", output: $output}
          }'
      )"

      curl --fail-with-body -sS \
        -X POST "$KIYT_BASE_URL/runs/$run_id/observations" \
        -H "Authorization: Bearer $KIYT_API_KEY" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: observation-$suffix-$cycle" \
        --data-binary "$observation_payload" >/dev/null
      ;;

    needs_input)
      decision_id="$(jq -er '.run.decision.decision_id' <<<"$run_json")"
      input_id="quickstart-input-$suffix-$cycle"
      input_payload="$(
        jq -n \
          --arg decision_id "$decision_id" \
          --arg input_id "$input_id" \
          '{
            decision_id: $decision_id,
            input_id: $input_id,
            data: {order_id: "ORD-1007"}
          }'
      )"

      curl --fail-with-body -sS \
        -X POST "$KIYT_BASE_URL/runs/$run_id/inputs" \
        -H "Authorization: Bearer $KIYT_API_KEY" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: input-$suffix-$cycle" \
        --data-binary "$input_payload" >/dev/null
      ;;
  esac
done

echo "Stopped after 8 decision cycles." >&2
exit 1
