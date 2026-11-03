export type PlaygroundAction = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type PlaygroundExample = {
  id: string;
  title: string;
  category: string;
  summary: string;
  objective: string;
  context: Record<string, unknown>;
  actions: PlaygroundAction[];
  observationExample: Record<string, unknown>;
  inputExample: Record<string, unknown>;
};

const schema = (...fields: string[]) => ({
  type: "object",
  properties: Object.fromEntries(
    fields.map((field) => [
      field,
      {type: "string"},
    ]),
  ),
  required: fields,
  additionalProperties: false,
});

const action = (
  name: string,
  description: string,
  ...fields: string[]
): PlaygroundAction => ({
  name,
  description,
  input_schema: schema(...fields),
});

export const EXAMPLES: PlaygroundExample[] = [
  {
    id: "delayed-order",
    title: "Delayed customer order",
    category: "Support / Delivery",
    summary: "A shipped order is one day late and the customer wants an update.",
    objective: "Choose the best next step for a delayed customer order while keeping the customer informed and avoiding an unnecessary refund.",
    context: {
      order_status: "shipped",
      days_late: 1,
      carrier_update: "Delayed in transit; estimated delivery tomorrow.",
      customer_message: "My order still hasn't arrived. What should we do?",
      refund_requested: false,
    },
    actions: [
      action("send_status_update", "Send the customer an updated delivery status.", "message"),
      action("issue_refund", "Refund the customer when a refund is justified.", "reason"),
      action("escalate_to_human", "Escalate the case for manual review.", "reason"),
    ],
    observationExample: {
      message_sent: true,
      customer_notified: true,
      channel: "email",
    },
    inputExample: {
      additional_information: "Provide the missing fact requested by KIYT.",
    },
  },
  {
    id: "hotel-overbooking",
    title: "Hotel overbooking",
    category: "Travel",
    summary: "A confirmed hotel cannot honor the reservation at check-in.",
    objective: "Choose the best next step for a traveler whose confirmed hotel is overbooked and who needs a fast resolution.",
    context: {
      booking_status: "confirmed",
      issue: "Hotel reported overbooking at check-in.",
      trip_stage: "same_day_check_in",
      traveler_message: "The hotel says they have no room.",
    },
    actions: [
      action("offer_alternative_hotel", "Offer a replacement hotel.", "hotel_name", "message"),
      action("issue_partial_refund", "Issue a partial goodwill refund.", "reason"),
      action("escalate_hotel_manager", "Escalate to hotel operations.", "reason"),
    ],
    observationExample: {
      alternative_sent: true,
      traveler_response: "accepted",
    },
    inputExample: {
      preferred_area: "City center",
    },
  },
  {
    id: "overdue-invoice",
    title: "Overdue invoice",
    category: "Finance",
    summary: "A long-term customer has an invoice overdue by twelve days.",
    objective: "Choose the best next step for an overdue invoice while preserving the customer relationship.",
    context: {
      invoice_status: "overdue",
      days_overdue: 12,
      amount_due: "USD 2400",
      customer_tier: "long_term",
      reminder_sent: true,
    },
    actions: [
      action("send_payment_reminder", "Send a payment reminder.", "message"),
      action("offer_payment_plan", "Offer a payment plan.", "plan_summary"),
      action("escalate_to_accounting", "Escalate to finance.", "reason"),
    ],
    observationExample: {
      reminder_sent: true,
      channel: "email",
    },
    inputExample: {
      customer_payment_commitment: "Friday",
    },
  },
  {
    id: "account-lockout",
    title: "Account lockout",
    category: "Security",
    summary: "A user is locked out after repeated failed login attempts.",
    objective: "Choose the safest next step for a locked-out account while balancing security and convenience.",
    context: {
      account_state: "locked",
      failed_attempts: 6,
      recent_location_change: true,
      security_risk: "medium",
    },
    actions: [
      action("send_password_reset", "Send a password reset.", "message"),
      action("request_identity_verification", "Request identity verification.", "checklist"),
      action("escalate_security_review", "Escalate to security.", "reason"),
    ],
    observationExample: {
      verification_requested: true,
      method: "document_check",
    },
    inputExample: {
      verified_account_email: "customer@example.com",
    },
  },
  {
    id: "subscription-save",
    title: "Subscription cancellation",
    category: "Retention",
    summary: "A high-value subscriber wants to cancel because of price.",
    objective: "Choose the best next step when a subscriber signals cancellation risk but may still be retained.",
    context: {
      plan: "pro_annual",
      tenure_months: 14,
      cancellation_requested: true,
      reason: "Too expensive for current team size.",
    },
    actions: [
      action("offer_retention_discount", "Offer a retention discount.", "offer_details"),
      action("schedule_retention_call", "Offer a retention call.", "reason"),
      action("process_cancellation", "Process cancellation.", "reason"),
    ],
    observationExample: {
      offer_sent: true,
      customer_response: "considering",
    },
    inputExample: {
      maximum_discount: "20%",
    },
  },
  {
    id: "travel-disruption",
    title: "Travel disruption",
    category: "Travel",
    summary: "A flight disruption occurs shortly before departure.",
    objective: "Choose the best next step for a traveler whose outbound flight was disrupted shortly before departure.",
    context: {
      trip_status: "flight_disrupted",
      departure_in_hours: 9,
      disruption_reason: "Carrier schedule change",
      traveler_priority: "arrive_same_day",
    },
    actions: [
      action("rebook_trip", "Offer a rebooking option.", "option_summary"),
      action("issue_travel_credit", "Issue travel credit.", "reason"),
      action("escalate_to_agent", "Escalate to a travel agent.", "reason"),
    ],
    observationExample: {
      rebooking_sent: true,
      traveler_accepted: true,
    },
    inputExample: {
      latest_acceptable_arrival: "22:00",
    },
  },
  {
    id: "fraud-review",
    title: "Suspicious checkout",
    category: "Risk",
    summary: "A high-value checkout shows multiple fraud signals.",
    objective: "Choose the best next step for a suspicious checkout while reducing fraud risk and avoiding unnecessary friction.",
    context: {
      order_value: "USD 980",
      billing_country_mismatch: true,
      prior_chargebacks: 1,
      device_trust: "low",
    },
    actions: [
      action("request_verification", "Request customer verification.", "message"),
      action("hold_order", "Hold the order for manual review.", "reason"),
      action("approve_order", "Approve the order.", "note"),
    ],
    observationExample: {
      verification_requested: true,
      customer_response: "pending",
    },
    inputExample: {
      verification_result: "passed",
    },
  },
  {
    id: "stockout",
    title: "Warehouse stockout",
    category: "Operations",
    summary: "A paid item is out of stock but a substitute may exist.",
    objective: "Choose the best next step for an order affected by a warehouse stockout while protecting customer experience.",
    context: {
      sku: "SKU-AX92",
      order_state: "paid",
      available_substitute: true,
      delivery_deadline: "2_days",
    },
    actions: [
      action("offer_substitute_item", "Offer a substitute product.", "substitute_sku", "message"),
      action("split_shipment", "Ship available items first.", "message"),
      action("issue_refund", "Refund the unavailable item.", "reason"),
    ],
    observationExample: {
      substitute_offered: true,
      customer_response: "accepted",
    },
    inputExample: {
      substitute_sku: "SKU-AX93",
    },
  },
  {
    id: "priority-bug",
    title: "Priority bug report",
    category: "Engineering",
    summary: "An enterprise customer reports a workflow-blocking bug.",
    objective: "Choose the best next step for a high-priority bug report from a key customer.",
    context: {
      severity: "high",
      customer_tier: "enterprise",
      reproducible: true,
      workaround_known: true,
    },
    actions: [
      action("acknowledge_incident", "Acknowledge the incident.", "message"),
      action("route_to_engineering", "Route to engineering.", "priority", "summary"),
      action("share_workaround", "Share the current workaround.", "workaround"),
    ],
    observationExample: {
      engineering_ticket_created: true,
      priority: "high",
    },
    inputExample: {
      affected_version: "2026.11.3",
    },
  },
  {
    id: "vendor-delay",
    title: "Vendor payment delay",
    category: "Procurement",
    summary: "A strategic vendor is asking about a delayed payment.",
    objective: "Choose the best next step for a vendor chasing a delayed payment while keeping the relationship healthy.",
    context: {
      invoice_status: "approved_but_not_paid",
      days_delayed: 7,
      vendor_tier: "strategic",
      blocker: "missing remittance confirmation",
    },
    actions: [
      action("confirm_payment_date", "Confirm the expected payment date.", "date_note"),
      action("request_missing_documents", "Request missing documents.", "document_list"),
      action("escalate_procurement", "Escalate internally.", "reason"),
    ],
    observationExample: {
      payment_date_shared: true,
      vendor_notified: true,
    },
    inputExample: {
      expected_payment_date: "2026-11-10",
    },
  },
];

export const HELP = {
  playground: {
    title: "How Playground works",
    description: "Playground sends a real cognitive request to KIYT. KIYT selects a next step, while your application remains responsible for executing business actions.",
    points: [
      "Objective describes the desired outcome.",
      "Context contains the facts available right now.",
      "Available actions define what KIYT is allowed to select.",
      "Observation reports what happened after an action was executed.",
    ],
    sample: "Goal → Reason → Select action → Execute externally → Observe → Continue",
  },
  objective: {
    title: "Objective",
    description: "Describe the outcome you want KIYT to optimize for, rather than giving it a hard-coded answer.",
    points: [
      "Keep the goal concrete.",
      "Include important trade-offs.",
      "Do not preselect the action yourself.",
    ],
    sample: "Choose the best next step while keeping the customer informed and avoiding an unnecessary refund.",
  },
  context: {
    title: "Context",
    description: "Context is the current evidence KIYT can reason from. It should describe the situation as factual structured data.",
    points: [
      "Use a JSON object.",
      "Include relevant facts only.",
      "Customer content is data, not system instruction.",
    ],
    sample: '{\n  "order_status": "shipped",\n  "days_late": 1\n}',
  },
  actions: {
    title: "Available actions",
    description: "Available actions are capabilities exposed by your application. KIYT chooses between them but does not execute them itself.",
    points: [
      "Each action has a stable name.",
      "Description explains when it is useful.",
      "input_schema defines the arguments KIYT must produce.",
    ],
    sample: '"send_status_update" — Send the customer an updated delivery status.',
  },
  decision: {
    title: "Decision",
    description: "Decision is KIYT's current cognitive output for this run.",
    points: [
      "ACTION SELECTED means your application should execute the chosen action.",
      "INPUT NEEDED means KIYT requires another fact before it can decide.",
      "COMPLETED means no further step is required.",
    ],
    sample: "send_status_update",
  },
  observation: {
    title: "Observation",
    description: "Observation records what actually happened after your application executed the selected action.",
    points: [
      "Choose Success or Failure.",
      "Report real execution facts.",
      "The same persisted run continues afterward.",
    ],
    sample: '{\n  "message_sent": true,\n  "customer_notified": true\n}',
  },
  input: {
    title: "Additional input",
    description: "Sometimes KIYT cannot safely choose an action because an important fact is missing. Provide that missing information and continue the same run.",
    points: [
      "This is not an action result.",
      "Send only the missing facts.",
      "Use a JSON object.",
    ],
    sample: '{\n  "substitute_sku": "SKU-AX93"\n}',
  },
} as const;

export type HelpKey = keyof typeof HELP;
