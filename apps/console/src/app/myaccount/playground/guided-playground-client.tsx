/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Code2,
  Download,
  Pause,
  Play,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Badge,
  Card,
  PageTitle,
} from "@/components/dashboard/ui";

import AdvancedPlaygroundClient from "./playground-client";

type Difficulty =
  | "easy"
  | "medium"
  | "hard";

type Decision = {
  decision_id?: string;
  status?: string;
  reason_summary?: string;
  action?: {
    name?: string;
    arguments?: Record<
      string,
      unknown
    >;
  } | null;
};

type RunState = {
  id: string;
  status: string;
  decision?: Decision | null;
  error?: {
    code?: string;
    retryable?: boolean;
  } | null;
};

type EasyInputs = {
  orderId: string;
  paid: boolean;
  addressLine: string;
  city: string;
  postalCode: string;
  requiredQuantity: number;
  inventoryQuantity: number;
};

type MediumInputs = {
  maxBudgetIdr: number;
  maxDeliveryHours: number;
};

type HardInputs = {
  orderId: string;
};

type ScenarioInputs =
  | EasyInputs
  | MediumInputs
  | HardInputs;

type SuppliedInput = {
  max_delivery_hours?: number;
  substitution_preference?:
    | "allow_equivalent"
    | "original_only";
  additional_details?: string;
};

type Execution = {
  status:
    | "success"
    | "failure";
  output: Record<
    string,
    unknown
  >;
  artifact?: Record<
    string,
    unknown
  >;
};

type ActivityRow = {
  id: string;
  at: string;
  actor:
    | "KIYT"
    | "Client"
    | "User";
  title: string;
  summary: string;
};

type PersistedExecution = {
  decisionId: string;
  actionName: string;
  arguments: Record<
    string,
    unknown
  >;
  execution: Execution;
  observationId: string;
  idempotencyKey: string;
  posted: boolean;
  at: string;
};

type Session = {
  schemaVersion: 1;
  userId: string;
  workspaceId: string;
  runId: string;
  scenarioId: Difficulty;
  scenarioVersion: string;
  scenarioInputs:
    ScenarioInputs;
  suppliedInput:
    SuppliedInput;
  requestBody: Record<
    string,
    unknown
  >;
  runIdempotencyKey: string;
  createdAt: string;
  actionCount: number;
  paused: boolean;
  executions: Record<
    string,
    PersistedExecution
  >;
  inputContinuations:
    Record<
      string,
      {
        inputId: string;
        idempotencyKey: string;
        body: Record<
          string,
          unknown
        >;
        posted: boolean;
      }
    >;
  activity:
    ActivityRow[];
};

type Props = {
  userId: string;
  workspaceId: string;
};

type DeliveryOption = {
  id: string;
  label: string;
  cost_idr: number;
  delivery_hours: number;
  available: boolean;
};

const MAX_ACTIONS = 12;
const MAX_RUNTIME_MS =
  5 * 60 * 1000;
const POLL_MS = 1400;

const PENDING =
  new Set([
    "queued",
    "running",
  ]);

const TERMINAL =
  new Set([
    "completed",
    "failed",
  ]);

const EASY_FIXTURES:
  Record<string, EasyInputs> = {
    "ORDER-1001": {
      orderId:
        "ORDER-1001",
      paid: true,
      addressLine:
        "18 Merdeka Avenue",
      city: "Jakarta",
      postalCode: "11480",
      requiredQuantity: 2,
      inventoryQuantity: 5,
    },

    "ORDER-1002": {
      orderId:
        "ORDER-1002",
      paid: true,
      addressLine:
        "18 Merdeka Avenue",
      city: "Jakarta",
      postalCode: "11480",
      requiredQuantity: 3,
      inventoryQuantity: 1,
    },
  };

const MEDIUM_OPTIONS:
  DeliveryOption[] = [
    {
      id: "standard",
      label: "Standard",
      cost_idr: 12000,
      delivery_hours: 72,
      available: true,
    },
    {
      id: "express",
      label: "Express",
      cost_idr: 22000,
      delivery_hours: 24,
      available: true,
    },
    {
      id: "priority",
      label: "Priority",
      cost_idr: 35000,
      delivery_hours: 12,
      available: true,
    },
  ];

const HARD_OPTIONS:
  DeliveryOption[] = [
    ...MEDIUM_OPTIONS,
    {
      id: "same_day",
      label: "Same Day",
      cost_idr: 40000,
      delivery_hours: 8,
      available: false,
    },
  ];

const HARD_ORDER = {
  order_id: "ORDER-2001",
  requested_sku: "SKU-AX92",
  required_quantity: 2,
  original_inventory: 1,
  max_budget_idr: 40000,
};

const HARD_ALTERNATIVES = [
  {
    sku: "SKU-AX93",
    location: "WH-JKT-02",
    inventory: 4,
    equivalent: true,
  },
  {
    sku: "SKU-AX94",
    location: "WH-BDG-01",
    inventory: 0,
    equivalent: true,
  },
];

const DEFAULT_INPUTS:
  Record<
    Difficulty,
    ScenarioInputs
  > = {
    easy: {
      ...EASY_FIXTURES[
        "ORDER-1001"
      ],
    },

    medium: {
      maxBudgetIdr: 25000,
      maxDeliveryHours: 48,
    },

    hard: {
      orderId:
        "ORDER-2001",
    },
  };

const SCENARIOS = {
  easy: {
    version:
      "order-ops-easy-v1",

    label: "Easy",

    title:
      "Check dispatch readiness",

    purpose:
      "Calculate whether a sample order is ready to dispatch.",

    objective:
      "Determine whether the selected sample order is ready to dispatch. Use the available client action and base the final result on the returned checks. Do not claim that any parcel has physically shipped.",

    actions: [
      {
        name:
          "check_dispatch_readiness",

        description:
          "Calculate payment, address, and inventory readiness checks for the selected sample order.",

        input_schema: {
          type: "object",

          properties: {
            order_id: {
              type: "string",
            },
          },

          required: [
            "order_id",
          ],

          additionalProperties:
            false,
        },
      },
    ],
  },

  medium: {
    version:
      "order-ops-medium-v1",

    label:
      "Medium",

    title:
      "Choose shipping within constraints",

    purpose:
      "Choose a delivery option within budget and deadline, then build a dispatch plan.",

    objective:
      "Choose a sample delivery option that satisfies the supplied maximum budget and delivery-time limit. Create a dispatch plan only from validated values. If no option is feasible, report that truthfully.",

    actions: [
      {
        name:
          "read_delivery_options",

        description:
          "Read the sample delivery options and current constraints.",

        input_schema: {
          type: "object",
          properties: {},
          additionalProperties:
            false,
        },
      },

      {
        name:
          "validate_delivery_option",

        description:
          "Validate one delivery option against the current constraints.",

        input_schema: {
          type: "object",

          properties: {
            option_id: {
              type: "string",
            },
          },

          required: [
            "option_id",
          ],

          additionalProperties:
            false,
        },
      },

      {
        name:
          "create_dispatch_plan",

        description:
          "Create a dispatch plan only when the selected delivery option satisfies the current constraints.",

        input_schema: {
          type: "object",

          properties: {
            option_id: {
              type: "string",
            },
          },

          required: [
            "option_id",
          ],

          additionalProperties:
            false,
        },
      },
    ],
  },

  hard: {
    version:
      "order-ops-hard-v1",

    label:
      "Hard",

    title:
      "Resolve incomplete fulfillment",

    purpose:
      "Resolve insufficient original stock with alternative inventory, an unavailable option, and missing user requirements.",

    objective:
      "Produce a fulfillment resolution for the sample order. Original stock is insufficient, Same Day is unavailable, and maximum delivery time plus substitution preference are intentionally missing. Do not invent missing requirements. Use client observations and request input when needed.",

    actions: [
      {
        name:
          "read_delivery_options",

        description:
          "Read delivery options, including an unavailable Same Day fixture.",

        input_schema: {
          type: "object",
          properties: {},
          additionalProperties:
            false,
        },
      },

      {
        name:
          "validate_delivery_option",

        description:
          "Validate one delivery option against current constraints.",

        input_schema: {
          type: "object",

          properties: {
            option_id: {
              type: "string",
            },
          },

          required: [
            "option_id",
          ],

          additionalProperties:
            false,
        },
      },

      {
        name:
          "create_dispatch_plan",

        description:
          "Create a delivery-only dispatch plan from a validated option; fulfillment still requires combined validation.",

        input_schema: {
          type: "object",

          properties: {
            option_id: {
              type: "string",
            },
          },

          required: [
            "option_id",
          ],

          additionalProperties:
            false,
        },
      },

      {
        name:
          "check_alternative_stock",

        description:
          "Check bounded alternative inventory without reserving stock.",

        input_schema: {
          type: "object",

          properties: {
            requested_sku: {
              type: "string",
            },
          },

          required: [
            "requested_sku",
          ],

          additionalProperties:
            false,
        },
      },

      {
        name:
          "validate_fulfillment_plan",

        description:
          "Validate alternative stock and delivery evidence together.",

        input_schema: {
          type: "object",

          properties: {
            alternative_sku: {
              type: "string",
            },

            delivery_option_id: {
              type: "string",
            },
          },

          required: [
            "alternative_sku",
            "delivery_option_id",
          ],

          additionalProperties:
            false,
        },
      },
    ],
  },
} as const;

const now = () =>
  new Date().toISOString();

const isRecord = (
  value: unknown,
): value is Record<
  string,
  unknown
> =>
  typeof value ===
    "object" &&
  value !== null &&
  !Array.isArray(value);

const pretty = (
  value: unknown,
) =>
  JSON.stringify(
    value,
    null,
    2,
  );

const storageKey = (
  userId: string,
  workspaceId: string,
) =>
  `kiyt.playground.guided.v1:${userId}:${workspaceId}`;

const makeId = (
  prefix: string,
) =>
  `${prefix}-${crypto.randomUUID()}`;

const formatIdr = (
  value: number,
) =>
  new Intl.NumberFormat(
    "en-US",
  ).format(value);

const formatTime = (
  value: string,
) =>
  new Date(
    value,
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
  );

const statusLabel = (
  status?: string,
) =>
  status
    ? status
        .replaceAll(
          "_",
          " ",
        )
        .toUpperCase()
    : "NOT STARTED";

function addActivity(
  session: Session,
  row: ActivityRow,
): Session {
  if (
    session.activity.some(
      (item) =>
        item.id === row.id,
    )
  ) {
    return session;
  }

  return {
    ...session,
    activity: [
      ...session.activity,
      row,
    ],
  };
}

function contextFor(
  scenario: Difficulty,
  inputs: ScenarioInputs,
) {
  if (
    scenario === "easy"
  ) {
    const value =
      inputs as EasyInputs;

    return {
      sample_business_data:
        true,

      order: {
        order_id:
          value.orderId,

        payment: {
          paid:
            value.paid,
        },

        shipping_address: {
          line1:
            value.addressLine,

          city:
            value.city,

          postal_code:
            value.postalCode,
        },

        items: [
          {
            sku:
              "SKU-RED",

            required_quantity:
              value.requiredQuantity,
          },
        ],

        inventory: {
          "SKU-RED":
            value.inventoryQuantity,
        },
      },
    };
  }

  if (
    scenario === "medium"
  ) {
    const value =
      inputs as MediumInputs;

    return {
      sample_business_data:
        true,

      order_id:
        "ORDER-1101",

      constraints: {
        max_budget_idr:
          value.maxBudgetIdr,

        max_delivery_hours:
          value.maxDeliveryHours,
      },

      delivery_options:
        MEDIUM_OPTIONS,

      currency_units:
        "IDR integer units",

      elapsed_time_units:
        "numeric hours",
    };
  }

  return {
    sample_business_data:
      true,

    order:
      HARD_ORDER,

    original_stock_check: {
      required_quantity: 2,
      available_quantity: 1,
      sufficient: false,
    },

    alternative_inventory:
      HARD_ALTERNATIVES,

    delivery_options:
      HARD_OPTIONS,

    missing_requirements: {
      max_delivery_hours:
        null,

      substitution_preference:
        null,
    },

    instruction:
      "Request missing requirements instead of inferring them.",
  };
}

function argsObject(
  value: unknown,
) {
  if (
    !isRecord(value)
  ) {
    throw new Error(
      "Action arguments must be an object.",
    );
  }

  return value;
}

function stringArg(
  args: Record<
    string,
    unknown
  >,
  key: string,
) {
  const value =
    args[key];

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${key} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function onlyKeys(
  args: Record<
    string,
    unknown
  >,
  allowed: string[],
) {
  const extra =
    Object.keys(
      args,
    ).find(
      (key) =>
        !allowed.includes(
          key,
        ),
    );

  if (extra) {
    throw new Error(
      `Unexpected action argument: ${extra}.`,
    );
  }
}

function validateOption(
  options:
    DeliveryOption[],
  optionId: string,
  maxBudgetIdr: number,
  maxHours:
    | number
    | null,
): Execution {
  const option =
    options.find(
      (item) =>
        item.id ===
        optionId,
    );

  if (!option) {
    return {
      status:
        "failure",

      output: {
        error: {
          code:
            "option_not_found",

          message:
            `Delivery option ${optionId} is not in the sample fixture.`,
        },
      },
    };
  }

  if (
    !option.available
  ) {
    return {
      status:
        "failure",

      output: {
        option,

        error: {
          code:
            "option_unavailable",

          message:
            `${option.label} is unavailable in the sample fixture.`,
        },
      },
    };
  }

  if (
    maxHours === null
  ) {
    return {
      status:
        "failure",

      output: {
        option,

        error: {
          code:
            "missing_delivery_requirement",

          message:
            "Maximum delivery time has not been supplied yet.",
        },
      },
    };
  }

  const checks = {
    budget: {
      passed:
        option.cost_idr <=
        maxBudgetIdr,

      actual_idr:
        option.cost_idr,

      maximum_idr:
        maxBudgetIdr,
    },

    delivery_time: {
      passed:
        option.delivery_hours <=
        maxHours,

      actual_hours:
        option.delivery_hours,

      maximum_hours:
        maxHours,
    },
  };

  return {
    status:
      "success",

    output: {
      option,
      checks,

      feasible:
        checks.budget
          .passed &&
        checks
          .delivery_time
          .passed,
    },
  };
}

function executeAction(
  scenario:
    Difficulty,
  inputs:
    ScenarioInputs,
  supplied:
    SuppliedInput,
  runId: string,
  actionName: string,
  rawArgs: unknown,
): Execution {
  const args =
    argsObject(
      rawArgs,
    );

  if (
    scenario === "easy"
  ) {
    if (
      actionName !==
      "check_dispatch_readiness"
    ) {
      throw new Error(
        `Unsupported Easy action: ${actionName}.`,
      );
    }

    onlyKeys(
      args,
      ["order_id"],
    );

    const value =
      inputs as EasyInputs;

    if (
      stringArg(
        args,
        "order_id",
      ) !==
      value.orderId
    ) {
      return {
        status:
          "failure",

        output: {
          error: {
            code:
              "order_not_found",

            message:
              "The requested sample order is not selected.",
          },
        },
      };
    }

    const payment =
      value.paid ===
      true;

    const address = [
      value.addressLine,
      value.city,
      value.postalCode,
    ].every(
      (item) =>
        item
          .trim()
          .length > 0,
    );

    const inventory =
      value.requiredQuantity >
        0 &&
      value.inventoryQuantity >=
        value.requiredQuantity;

    return {
      status:
        "success",

      output: {
        order_id:
          value.orderId,

        checks: {
          payment: {
            passed:
              payment,
            paid:
              value.paid,
          },

          address: {
            passed:
              address,
          },

          inventory: {
            passed:
              inventory,

            required_quantity:
              value.requiredQuantity,

            available_quantity:
              value.inventoryQuantity,
          },
        },

        ready:
          payment &&
          address &&
          inventory,
      },
    };
  }

  const options =
    scenario === "hard"
      ? HARD_OPTIONS
      : MEDIUM_OPTIONS;

  const medium =
    inputs as MediumInputs;

  const maxBudget =
    scenario === "medium"
      ? medium.maxBudgetIdr
      : HARD_ORDER.max_budget_idr;

  const maxHours =
    scenario === "medium"
      ? medium.maxDeliveryHours
      : supplied.max_delivery_hours ??
        null;

  if (
    actionName ===
    "read_delivery_options"
  ) {
    onlyKeys(
      args,
      [],
    );

    return {
      status:
        "success",

      output: {
        options,

        constraints: {
          max_budget_idr:
            maxBudget,

          max_delivery_hours:
            maxHours,
        },
      },
    };
  }

  if (
    actionName ===
    "validate_delivery_option"
  ) {
    onlyKeys(
      args,
      ["option_id"],
    );

    return validateOption(
      options,
      stringArg(
        args,
        "option_id",
      ),
      maxBudget,
      maxHours,
    );
  }

  if (
    actionName ===
    "create_dispatch_plan"
  ) {
    onlyKeys(
      args,
      ["option_id"],
    );

    const optionId =
      stringArg(
        args,
        "option_id",
      );

    const validation =
      validateOption(
        options,
        optionId,
        maxBudget,
        maxHours,
      );

    if (
      validation.status ===
        "failure" ||
      validation.output
        .feasible !== true
    ) {
      return {
        status:
          "failure",

        output: {
          ...validation.output,

          error: {
            code:
              "option_outside_constraints",

            message:
              "The selected option is not a valid dispatch choice.",
          },
        },
      };
    }

    const option =
      options.find(
        (item) =>
          item.id ===
          optionId,
      )!;

    const artifact = {
      artifact_type:
        "dispatch_plan",

      run_id:
        runId,

      scenario_version:
        SCENARIOS[
          scenario
        ].version,

      order_id:
        scenario ===
        "hard"
          ? HARD_ORDER.order_id
          : "ORDER-1101",

      option: {
        id:
          option.id,

        label:
          option.label,

        cost_idr:
          option.cost_idr,

        delivery_hours:
          option.delivery_hours,
      },

      constraints: {
        max_budget_idr:
          maxBudget,

        max_delivery_hours:
          maxHours,
      },

      verified:
        true,
    };

    return {
      status:
        "success",

      output: {
        plan:
          artifact,

        verification:
          validation.output,
      },

      artifact,
    };
  }

  if (
    scenario !== "hard"
  ) {
    throw new Error(
      `Unsupported Medium action: ${actionName}.`,
    );
  }

  if (
    actionName ===
    "check_alternative_stock"
  ) {
    onlyKeys(
      args,
      [
        "requested_sku",
      ],
    );

    const requestedSku =
      stringArg(
        args,
        "requested_sku",
      );

    if (
      requestedSku !==
      HARD_ORDER.requested_sku
    ) {
      return {
        status:
          "failure",

        output: {
          error: {
            code:
              "sku_not_found",

            message:
              "The requested SKU is not part of this sample scenario.",
          },
        },
      };
    }

    return {
      status:
        "success",

      output: {
        requested_sku:
          requestedSku,

        required_quantity:
          HARD_ORDER.required_quantity,

        substitution_preference:
          supplied.substitution_preference ??
          null,

        preference_missing:
          supplied.substitution_preference ===
          undefined,

        candidates:
          HARD_ALTERNATIVES.map(
            (item) => ({
              ...item,

              sufficient_quantity:
                item.inventory >=
                HARD_ORDER.required_quantity,

              allowed_by_preference:
                supplied.substitution_preference ===
                "allow_equivalent"
                  ? item.equivalent
                  : supplied.substitution_preference ===
                      "original_only"
                    ? false
                    : null,
            }),
          ),
      },
    };
  }

  if (
    actionName ===
    "validate_fulfillment_plan"
  ) {
    onlyKeys(
      args,
      [
        "alternative_sku",
        "delivery_option_id",
      ],
    );

    const alternativeSku =
      stringArg(
        args,
        "alternative_sku",
      );

    const optionId =
      stringArg(
        args,
        "delivery_option_id",
      );

    if (
      supplied.substitution_preference ===
        undefined ||
      maxHours === null
    ) {
      return {
        status:
          "failure",

        output: {
          error: {
            code:
              "missing_fulfillment_requirements",

            message:
              "Maximum delivery time and substitution preference are required before the plan can be verified.",
          },

          missing: {
            max_delivery_hours:
              maxHours ===
              null,

            substitution_preference:
              supplied.substitution_preference ===
              undefined,
          },
        },
      };
    }

    const alternative =
      HARD_ALTERNATIVES.find(
        (item) =>
          item.sku ===
          alternativeSku,
      );

    const delivery =
      validateOption(
        HARD_OPTIONS,
        optionId,
        maxBudget,
        maxHours,
      );

    const stockChecks = {
      found:
        Boolean(
          alternative,
        ),

      sufficient_quantity:
        Boolean(
          alternative &&
            alternative.inventory >=
              HARD_ORDER.required_quantity,
        ),

      substitution_allowed:
        Boolean(
          alternative &&
            alternative.equivalent &&
            supplied.substitution_preference ===
              "allow_equivalent",
        ),
    };

    const verified =
      stockChecks.found &&
      stockChecks
        .sufficient_quantity &&
      stockChecks
        .substitution_allowed &&
      delivery.status ===
        "success" &&
      delivery.output
        .feasible === true;

    const artifact = {
      artifact_type:
        "fulfillment_resolution",

      run_id:
        runId,

      scenario_version:
        SCENARIOS.hard
          .version,

      order_id:
        HARD_ORDER.order_id,

      original_stock: {
        sku:
          HARD_ORDER.requested_sku,

        required_quantity:
          2,

        available_quantity:
          1,

        sufficient:
          false,
      },

      alternative:
        alternative ??
        null,

      delivery:
        delivery.output,

      supplied_requirements: {
        max_delivery_hours:
          maxHours,

        substitution_preference:
          supplied.substitution_preference,

        additional_details:
          supplied.additional_details ??
          null,
      },

      stock_checks:
        stockChecks,

      verified,

      outcome:
        verified
          ? "verified_plan"
          : "unresolved",
    };

    return {
      status:
        delivery.status ===
        "failure"
          ? "failure"
          : "success",

      output: {
        resolution:
          artifact,
      },

      artifact,
    };
  }

  throw new Error(
    `Unsupported Hard action: ${actionName}.`,
  );
}

async function responseJson(
  response: Response,
): Promise<
  Record<
    string,
    unknown
  >
> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    const value:
      unknown =
        JSON.parse(text);

    return isRecord(
      value,
    )
      ? value
      : {
          data:
            value,
        };
  } catch {
    return {
      error:
        text,
    };
  }
}

function normalizeRun(
  value: unknown,
): RunState {
  if (
    !isRecord(value) ||
    typeof value.id !==
      "string" ||
    typeof value.status !==
      "string"
  ) {
    throw new Error(
      "Invalid run response.",
    );
  }

  return {
    id:
      value.id,

    status:
      value.status,

    decision:
      isRecord(
        value.decision,
      )
        ? value.decision as Decision
        : null,

    error:
      isRecord(
        value.error,
      )
        ? value.error as RunState["error"]
        : null,
  };
}

export default function GuidedPlaygroundClient({
  userId,
  workspaceId,
}: Props) {
  const [
    advanced,
    setAdvanced,
  ] = useState(false);

  const [
    scenario,
    setScenario,
  ] =
    useState<Difficulty>(
      "easy",
    );

  const [
    inputs,
    setInputs,
  ] =
    useState<
      Record<
        Difficulty,
        ScenarioInputs
      >
    >(() => ({
      easy: {
        ...DEFAULT_INPUTS.easy,
      } as EasyInputs,

      medium: {
        ...DEFAULT_INPUTS.medium,
      } as MediumInputs,

      hard: {
        ...DEFAULT_INPUTS.hard,
      } as HardInputs,
    }));

  const [
    session,
    setSession,
  ] =
    useState<
      Session | null
    >(null);

  const [
    run,
    setRun,
  ] =
    useState<
      RunState | null
    >(null);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    apiOpen,
    setApiOpen,
  ] = useState(false);

  const [
    inputHours,
    setInputHours,
  ] = useState("24");

  const [
    inputPreference,
    setInputPreference,
  ] = useState("");

  const [
    additionalDetails,
    setAdditionalDetails,
  ] = useState("");

  const inFlight =
    useRef(
      new Set<string>(),
    );

  const currentScenario =
    SCENARIOS[
      scenario
    ];

  const persist =
    useCallback(
      (
        next:
          | Session
          | null,
      ) => {
        setSession(next);

        if (next) {
          localStorage.setItem(
            storageKey(
              userId,
              workspaceId,
            ),
            JSON.stringify(
              next,
            ),
          );
        } else {
          localStorage.removeItem(
            storageKey(
              userId,
              workspaceId,
            ),
          );
        }
      },
      [
        userId,
        workspaceId,
      ],
    );

  const loadRun =
    useCallback(
      async (
        runId: string,
      ) => {
        const controller =
          new AbortController();

        const timer =
          window.setTimeout(
            () =>
              controller.abort(),
            12000,
          );

        try {
          const response =
            await fetch(
              `/api/console/cognitive/runs/${encodeURIComponent(runId)}`,
              {
                cache:
                  "no-store",

                signal:
                  controller.signal,
              },
            );

          const body =
            await responseJson(
              response,
            );

          if (
            !response.ok
          ) {
            throw new Error(
              typeof body.error ===
                "string"
                ? body.error
                : "Unable to load the run.",
            );
          }

          const next =
            normalizeRun(
              body.run,
            );

          setRun(next);

          return next;
        } finally {
          window.clearTimeout(
            timer,
          );
        }
      },
      [],
    );

  useEffect(() => {
    const raw =
      localStorage.getItem(
        storageKey(
          userId,
          workspaceId,
        ),
      );

    if (!raw) {
      return;
    }

    try {
      const saved =
        JSON.parse(
          raw,
        ) as Session;

      if (
        saved.schemaVersion !==
          1 ||
        saved.userId !==
          userId ||
        saved.workspaceId !==
          workspaceId ||
        !SCENARIOS[
          saved.scenarioId
        ] ||
        saved.scenarioVersion !==
          SCENARIOS[
            saved.scenarioId
          ].version
      ) {
        return;
      }

      setScenario(
        saved.scenarioId,
      );

      setInputs(
        (current) => ({
          ...current,

          [saved.scenarioId]:
            saved.scenarioInputs,
        }),
      );

      setSession(
        saved,
      );

      void loadRun(
        saved.runId,
      ).catch(() =>
        setError(
          "The saved run could not be reloaded. Open Advanced to inspect manually.",
        ),
      );
    } catch {
      localStorage.removeItem(
        storageKey(
          userId,
          workspaceId,
        ),
      );
    }
  }, [
    loadRun,
    userId,
    workspaceId,
  ]);

  const postObservation =
    useCallback(
      async (
        active: Session,
        record:
          PersistedExecution,
      ) => {
        if (
          record.posted
        ) {
          return;
        }

        const key =
          `${workspaceId}:${active.runId}:${record.decisionId}:observation`;

        if (
          inFlight.current.has(
            key,
          )
        ) {
          return;
        }

        inFlight.current.add(
          key,
        );

        const body = {
          decision_id:
            record.decisionId,

          observation_id:
            record.observationId,

          result: {
            status:
              record.execution.status,

            output:
              record.execution.output,
          },
        };

        try {
          try {
            const response =
              await fetch(
                `/api/console/cognitive/runs/${encodeURIComponent(active.runId)}/observations`,
                {
                  method:
                    "POST",

                  headers: {
                    "Content-Type":
                      "application/json",

                    "Idempotency-Key":
                      record.idempotencyKey,
                  },

                  body:
                    JSON.stringify(
                      body,
                    ),
                },
              );

            const payload =
              await responseJson(
                response,
              );

            if (
              !response.ok
            ) {
              throw new Error(
                typeof payload.error ===
                  "string"
                  ? payload.error
                  : "Observation submission failed.",
              );
            }

            const updated =
              addActivity(
                {
                  ...active,

                  executions: {
                    ...active.executions,

                    [record.decisionId]:
                      {
                        ...record,
                        posted:
                          true,
                      },
                  },
                },
                {
                  id:
                    `obs:${record.decisionId}`,

                  at:
                    now(),

                  actor:
                    "Client",

                  title:
                    "Observation submitted",

                  summary:
                    `${record.actionName} result returned to KIYT.`,
                },
              );

            persist(
              updated,
            );

            if (
              isRecord(
                payload.run,
              )
            ) {
              setRun(
                normalizeRun(
                  payload.run,
                ),
              );
            } else {
              await loadRun(
                active.runId,
              );
            }
          } catch (
            cause
          ) {
            const fresh =
              await loadRun(
                active.runId,
              );

            if (
              fresh.decision
                ?.decision_id !==
                record.decisionId ||
              fresh.status !==
                "requires_action"
            ) {
              persist({
                ...active,

                executions: {
                  ...active.executions,

                  [record.decisionId]:
                    {
                      ...record,
                      posted:
                        true,
                    },
                },
              });

              return;
            }

            throw cause;
          }
        } finally {
          inFlight.current.delete(
            key,
          );
        }
      },
      [
        loadRun,
        persist,
        workspaceId,
      ],
    );

  const handleAction =
    useCallback(
      async (
        active: Session,
        currentRun:
          RunState,
      ) => {
        const decision =
          currentRun.decision;

        const decisionId =
          decision
            ?.decision_id;

        const actionName =
          decision
            ?.action
            ?.name;

        if (
          !decisionId ||
          !actionName
        ) {
          return;
        }

        const identity =
          `${workspaceId}:${active.runId}:${decisionId}`;

        if (
          inFlight.current.has(
            identity,
          )
        ) {
          return;
        }

        if (
          active.paused
        ) {
          return;
        }

        if (
          active.actionCount >=
            MAX_ACTIONS ||
          Date.now() -
            new Date(
              active.createdAt,
            ).getTime() >
            MAX_RUNTIME_MS
        ) {
          persist({
            ...active,

            paused:
              true,

            activity: [
              ...active.activity,

              {
                id:
                  `limit:${decisionId}`,

                at:
                  now(),

                actor:
                  "Client",

                title:
                  "Client loop paused",

                summary:
                  "Reference client safety ceiling reached. The server run was not cancelled.",
              },
            ],
          });

          return;
        }

        const existing =
          active.executions[
            decisionId
          ];

        if (existing) {
          if (
            !existing.posted
          ) {
            await postObservation(
              active,
              existing,
            );
          }

          return;
        }

        inFlight.current.add(
          identity,
        );

        try {
          let execution:
            Execution;

          try {
            execution =
              executeAction(
                active.scenarioId,
                active.scenarioInputs,
                active.suppliedInput,
                active.runId,
                actionName,
                decision
                  ?.action
                  ?.arguments ??
                  {},
              );
          } catch (
            cause
          ) {
            execution = {
              status:
                "failure",

              output: {
                error: {
                  code:
                    "client_validation_failed",

                  message:
                    cause instanceof
                    Error
                      ? cause.message
                      : "Client action validation failed.",
                },
              },
            };
          }

          const record:
            PersistedExecution =
              {
                decisionId,
                actionName,

                arguments:
                  decision
                    ?.action
                    ?.arguments ??
                  {},

                execution,

                observationId:
                  makeId(
                    "pg-obs",
                  ),

                idempotencyKey:
                  makeId(
                    "pg-observation",
                  ),

                posted:
                  false,

                at:
                  now(),
              };

          let updated = {
            ...active,

            actionCount:
              active.actionCount +
              1,

            executions: {
              ...active.executions,

              [decisionId]:
                record,
            },
          };

          updated =
            addActivity(
              updated,
              {
                id:
                  `exec:${decisionId}`,

                at:
                  record.at,

                actor:
                  "Client",

                title:
                  `Executed ${actionName}`,

                summary:
                  execution.status ===
                  "success"
                    ? "Local sample function completed."
                    : "Local sample function returned a failure observation.",
              },
            );

          persist(
            updated,
          );

          await postObservation(
            updated,
            record,
          );
        } finally {
          inFlight.current.delete(
            identity,
          );
        }
      },
      [
        persist,
        postObservation,
        workspaceId,
      ],
    );

  useEffect(() => {
    if (
      !session ||
      !run ||
      session.runId !==
        run.id
    ) {
      return;
    }

    const decisionId =
      run.decision
        ?.decision_id;

    if (!decisionId) {
      return;
    }

    const next =
      addActivity(
        session,
        {
          id:
            `kiyt:${decisionId}:${run.status}`,

          at:
            now(),

          actor:
            "KIYT",

          title:
            statusLabel(
              run.status,
            ),

          summary:
            run.decision
              ?.reason_summary ??
            "KIYT returned a customer-safe decision.",
        },
      );

    if (
      next !==
      session
    ) {
      persist(
        next,
      );
    }
  }, [
    persist,
    run,
    session,
  ]);

  useEffect(() => {
    if (
      !session ||
      !run ||
      session.runId !==
        run.id ||
      session.paused
    ) {
      return;
    }

    if (
      run.status ===
      "requires_action"
    ) {
      void handleAction(
        session,
        run,
      ).catch(
        (cause) =>
          setError(
            cause instanceof
            Error
              ? cause.message
              : "Client action failed.",
          ),
      );
    }
  }, [
    handleAction,
    run,
    session,
  ]);

  useEffect(() => {
    if (
      !session ||
      !run ||
      session.paused ||
      (
        !PENDING.has(
          run.status,
        ) &&
        run.status !==
          "requires_action"
      )
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () =>
          void loadRun(
            session.runId,
          ).catch(
            (cause) =>
              setError(
                cause instanceof
                Error
                  ? cause.message
                  : "Polling failed.",
              ),
          ),
        POLL_MS,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, [
    loadRun,
    run,
    session,
  ]);

  async function startRun() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");
    setRun(null);

    try {
      const selectedInputs =
        structuredClone(
          inputs[
            scenario
          ],
        );

      const requestBody = {
        objective:
          currentScenario.objective,

        context:
          contextFor(
            scenario,
            selectedInputs,
          ),

        available_actions:
          currentScenario.actions,
      };

      const runIdempotencyKey =
        makeId(
          `playground-${scenario}`,
        );

      const response =
        await fetch(
          "/api/console/cognitive/runs",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Idempotency-Key":
                runIdempotencyKey,
            },

            body:
              JSON.stringify(
                requestBody,
              ),
          },
        );

      const body =
        await responseJson(
          response,
        );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.error ===
            "string"
            ? body.error
            : "Unable to create run.",
        );
      }

      if (
        typeof body.run_id !==
        "string"
      ) {
        throw new Error(
          "Run response did not include a run ID.",
        );
      }

      const created:
        Session = {
          schemaVersion: 1,
          userId,
          workspaceId,

          runId:
            body.run_id,

          scenarioId:
            scenario,

          scenarioVersion:
            currentScenario.version,

          scenarioInputs:
            selectedInputs,

          suppliedInput:
            {},

          requestBody,

          runIdempotencyKey,

          createdAt:
            now(),

          actionCount: 0,
          paused: false,

          executions:
            {},

          inputContinuations:
            {},

          activity: [
            {
              id:
                `run:${body.run_id}`,

              at:
                now(),

              actor:
                "User",

              title:
                "Test started",

              summary:
                `${currentScenario.label}: ${currentScenario.title}`,
            },
          ],
        };

      persist(
        created,
      );

      if (
        isRecord(
          body.run,
        )
      ) {
        setRun(
          normalizeRun(
            body.run,
          ),
        );
      } else {
        await loadRun(
          body.run_id,
        );
      }
    } catch (
      cause
    ) {
      setError(
        cause instanceof
        Error
          ? cause.message
          : "Unable to start the test.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitInput() {
    if (
      !session ||
      !run?.decision
        ?.decision_id ||
      run.status !==
        "needs_input" ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError("");

    const decisionId =
      run.decision
        .decision_id;

    const existing =
      session
        .inputContinuations[
        decisionId
      ];

    let data:
      SuppliedInput;

    if (
      session.scenarioId ===
      "hard"
    ) {
      const maxHours =
        Number(
          inputHours,
        );

      if (
        !Number.isFinite(
          maxHours,
        ) ||
        maxHours <= 0
      ) {
        setBusy(false);

        setError(
          "Maximum delivery hours must be a positive number.",
        );

        return;
      }

      if (
        !inputPreference
      ) {
        setBusy(false);

        setError(
          "Choose a substitution preference before continuing.",
        );

        return;
      }

      data = {
        max_delivery_hours:
          maxHours,

        substitution_preference:
          inputPreference as SuppliedInput["substitution_preference"],

        ...(additionalDetails.trim()
          ? {
              additional_details:
                additionalDetails.trim(),
            }
          : {}),
      };
    } else {
      if (
        !additionalDetails.trim()
      ) {
        setBusy(false);

        setError(
          "Enter the information KIYT requested before continuing.",
        );

        return;
      }

      data = {
        additional_details:
          additionalDetails.trim(),
      };
    }

    const body =
      existing?.body ?? {
        decision_id:
          decisionId,

        input_id:
          makeId(
            "pg-input",
          ),

        data,
      };

    const idempotencyKey =
      existing
        ?.idempotencyKey ??
      makeId(
        "pg-input-continuation",
      );

    const inputId =
      typeof body.input_id ===
      "string"
        ? body.input_id
        : makeId(
            "pg-input",
          );

    const updated:
      Session = {
        ...session,

        suppliedInput: {
          ...session.suppliedInput,
          ...data,
        },

        inputContinuations: {
          ...session.inputContinuations,

          [decisionId]: {
            inputId,
            idempotencyKey,
            body,
            posted: false,
          },
        },
      };

    persist(
      addActivity(
        updated,
        {
          id:
            `input:${decisionId}`,

          at:
            now(),

          actor:
            "User",

          title:
            "Input supplied",

          summary:
            "Missing delivery requirements were supplied to the same KIYT run.",
        },
      ),
    );

    try {
      try {
        const response =
          await fetch(
            `/api/console/cognitive/runs/${encodeURIComponent(session.runId)}/inputs`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "Idempotency-Key":
                  idempotencyKey,
              },

              body:
                JSON.stringify(
                  body,
                ),
            },
          );

        const payload =
          await responseJson(
            response,
          );

        if (
          !response.ok
        ) {
          throw new Error(
            typeof payload.error ===
              "string"
              ? payload.error
              : "Input submission failed.",
          );
        }

        persist({
          ...updated,

          inputContinuations: {
            ...updated.inputContinuations,

            [decisionId]: {
              ...updated.inputContinuations[
                decisionId
              ],

              posted:
                true,
            },
          },
        });

        if (
          isRecord(
            payload.run,
          )
        ) {
          setRun(
            normalizeRun(
              payload.run,
            ),
          );
        } else {
          await loadRun(
            session.runId,
          );
        }
      } catch (
        cause
      ) {
        const fresh =
          await loadRun(
            session.runId,
          );

        if (
          fresh.decision
            ?.decision_id !==
            decisionId ||
          fresh.status !==
            "needs_input"
        ) {
          persist({
            ...updated,

            inputContinuations: {
              ...updated.inputContinuations,

              [decisionId]: {
                ...updated.inputContinuations[
                  decisionId
                ],

                posted:
                  true,
              },
            },
          });

          return;
        }

        throw cause;
      }
    } catch (
      cause
    ) {
      setError(
        cause instanceof
        Error
          ? cause.message
          : "Input submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const artifact =
    useMemo(() => {
      if (!session) {
        return null;
      }

      const rows =
        Object.values(
          session.executions,
        )
          .filter(
            (row) =>
              row.execution
                .artifact,
          )
          .sort(
            (a, b) =>
              a.at.localeCompare(
                b.at,
              ),
          );

      return (
        rows.at(-1)
          ?.execution
          .artifact ??
        null
      );
    }, [session]);

  const latestExecution =
    useMemo(
      () =>
        session
          ? Object.values(
              session.executions,
            )
              .sort(
                (a, b) =>
                  a.at.localeCompare(
                    b.at,
                  ),
              )
              .at(-1) ??
            null
          : null,
      [session],
    );

  const verification =
    useMemo(() => {
      if (!session) {
        return {
          label:
            "Not started",

          detail:
            "Run a guided test to collect verifiable client evidence.",
        };
      }

      if (
        run?.status ===
        "failed"
      ) {
        return {
          label:
            "Run failed",

          detail:
            run.error?.code
              ?.replaceAll(
                "_",
                " ",
              ) ??
            "KIYT returned a failed terminal state.",
        };
      }

      if (
        artifact &&
        artifact.verified ===
          true &&
        (
          session.scenarioId !==
            "hard" ||
          artifact.artifact_type ===
            "fulfillment_resolution"
        )
      ) {
        return {
          label:
            "Verified",

          detail:
            "The client artifact is backed by actual local function output and current constraints.",
        };
      }

      if (
        latestExecution
          ?.execution
          .output
          .ready ===
        true
      ) {
        return {
          label:
            "Ready",

          detail:
            "Payment, address, and inventory checks passed. This does not mean the parcel was physically shipped.",
        };
      }

      if (
        latestExecution
          ?.execution
          .output
          .ready ===
        false
      ) {
        return {
          label:
            "Not ready",

          detail:
            "At least one calculated readiness check failed.",
        };
      }

      if (
        run?.status ===
        "completed"
      ) {
        return {
          label:
            "Verification incomplete",

          detail:
            "KIYT completed, but the client does not have enough verified business evidence to claim success.",
        };
      }

      return {
        label:
          "In progress",

        detail:
          "The client is waiting for KIYT or additional verified evidence.",
      };
    }, [
      artifact,
      latestExecution,
      run,
      session,
    ]);

  function downloadArtifact() {
    if (
      !artifact ||
      !session
    ) {
      return;
    }

    const blob =
      new Blob(
        [
          pretty({
            ...artifact,
            run_id:
              session.runId,
          }),
        ],
        {
          type:
            "application/json",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href =
      url;

    anchor.download =
      `${session.scenarioId}-${session.runId}.json`;

    anchor.click();

    URL.revokeObjectURL(
      url,
    );
  }

  function resetClient() {
    persist(null);
    setRun(null);
    setError("");
    setInputPreference("");
    setAdditionalDetails("");
  }

  if (advanced) {
    return (
      <div className="guided-advanced-wrap">
        <button
          type="button"
          className="button"
          onClick={() =>
            setAdvanced(
              false,
            )
          }
        >
          Back to guided tests
        </button>

        <AdvancedPlaygroundClient />
      </div>
    );
  }

  const easy =
    inputs.easy as EasyInputs;

  const medium =
    inputs.medium as MediumInputs;

  const activeScenario =
    session?.scenarioId ??
    scenario;

  return (
    <div className="guided-playground">
      <PageTitle
        title="Playground"
        description="Run real tasks through KIYT API."
      >
        <button
          type="button"
          className="button"
          onClick={() =>
            setAdvanced(true)
          }
        >
          <SlidersHorizontal
            size={15}
          />
          Advanced
        </button>
      </PageTitle>

      <div className="guided-note">
        Sample business data. Real KIYT API calls and executable client tools.
      </div>

      <div
        className="guided-tabs"
        role="tablist"
        aria-label="Task difficulty"
      >
        {(
          Object.keys(
            SCENARIOS,
          ) as Difficulty[]
        ).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={
              scenario === id
            }
            className={
              scenario === id
                ? "active"
                : ""
            }
            disabled={
              Boolean(
                session,
              )
            }
            onClick={() =>
              setScenario(
                id,
              )
            }
          >
            {
              SCENARIOS[
                id
              ].label
            }
          </button>
        ))}
      </div>

      <div className="guided-main-grid">
        <Card className="guided-task-card">
          <div className="guided-card-head">
            <div>
              <span>
                SELECTED TASK
              </span>

              <h2>
                {
                  SCENARIOS[
                    activeScenario
                  ].title
                }
              </h2>

              <p>
                {
                  SCENARIOS[
                    activeScenario
                  ].purpose
                }
              </p>
            </div>

            <Badge
              tone={
                session
                  ? "blue"
                  : "neutral"
              }
            >
              {SCENARIOS[
                activeScenario
              ].label.toUpperCase()}
            </Badge>
          </div>

          {!session &&
            scenario ===
              "easy" && (
              <div className="guided-fields">
                <label>
                  Sample order

                  <select
                    value={
                      easy.orderId
                    }
                    onChange={(
                      event,
                    ) =>
                      setInputs(
                        (
                          current,
                        ) => ({
                          ...current,

                          easy: {
                            ...EASY_FIXTURES[
                              event
                                .target
                                .value
                            ],
                          },
                        }),
                      )
                    }
                  >
                    <option value="ORDER-1001">
                      ORDER-1001 — ready fixture
                    </option>

                    <option value="ORDER-1002">
                      ORDER-1002 — insufficient stock
                    </option>
                  </select>
                </label>

                <div className="guided-mini-grid">
                  <label>
                    Paid

                    <select
                      value={
                        easy.paid
                          ? "yes"
                          : "no"
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputs(
                          (
                            current,
                          ) => ({
                            ...current,

                            easy: {
                              ...easy,

                              paid:
                                event
                                  .target
                                  .value ===
                                "yes",
                            },
                          }),
                        )
                      }
                    >
                      <option value="yes">
                        Yes
                      </option>

                      <option value="no">
                        No
                      </option>
                    </select>
                  </label>

                  <label>
                    Inventory

                    <input
                      type="number"
                      min="0"
                      value={
                        easy.inventoryQuantity
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputs(
                          (
                            current,
                          ) => ({
                            ...current,

                            easy: {
                              ...easy,

                              inventoryQuantity:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          }),
                        )
                      }
                    />
                  </label>
                </div>

                <label>
                  Address

                  <input
                    value={
                      easy.addressLine
                    }
                    onChange={(
                      event,
                    ) =>
                      setInputs(
                        (
                          current,
                        ) => ({
                          ...current,

                          easy: {
                            ...easy,

                            addressLine:
                              event
                                .target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>
              </div>
            )}

          {!session &&
            scenario ===
              "medium" && (
              <div className="guided-fields">
                <div className="guided-mini-grid">
                  <label>
                    Max budget (IDR)

                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={
                        medium.maxBudgetIdr
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputs(
                          (
                            current,
                          ) => ({
                            ...current,

                            medium: {
                              ...medium,

                              maxBudgetIdr:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          }),
                        )
                      }
                    />
                  </label>

                  <label>
                    Max delivery hours

                    <input
                      type="number"
                      min="1"
                      value={
                        medium.maxDeliveryHours
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputs(
                          (
                            current,
                          ) => ({
                            ...current,

                            medium: {
                              ...medium,

                              maxDeliveryHours:
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                            },
                          }),
                        )
                      }
                    />
                  </label>
                </div>

                <div className="guided-options">
                  {MEDIUM_OPTIONS.map(
                    (
                      option,
                    ) => (
                      <span
                        key={
                          option.id
                        }
                      >
                        {
                          option.label
                        }

                        <strong>
                          {formatIdr(
                            option.cost_idr,
                          )}{" "}
                          IDR ·{" "}
                          {
                            option.delivery_hours
                          }
                          h
                        </strong>
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}

          {!session &&
            scenario ===
              "hard" && (
              <div className="guided-hard-summary">
                <p>
                  <strong>
                    ORDER-2001
                  </strong>{" "}
                  needs 2 ×
                  SKU-AX92,
                  but original
                  stock is 1.
                </p>

                <p>
                  Alternative
                  inventory
                  exists. Same
                  Day is
                  explicitly
                  unavailable.
                  Delivery
                  requirement
                  and
                  substitution
                  preference are
                  intentionally
                  missing.
                </p>
              </div>
            )}

          {session && (
            <div className="guided-running-summary">
              <span>
                Active run keeps its original scenario, version, and inputs even if the page is reloaded.
              </span>

              <code>
                {
                  session.runId
                }
              </code>
            </div>
          )}

          <div className="guided-primary-row">
            {!session ? (
              <button
                type="button"
                className="button primary"
                disabled={
                  busy
                }
                onClick={
                  startRun
                }
              >
                <Play
                  size={15}
                />

                {busy
                  ? "Starting…"
                  : "Run test"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    persist({
                      ...session,

                      paused:
                        !session.paused,
                    })
                  }
                >
                  {session.paused ? (
                    <Play
                      size={14}
                    />
                  ) : (
                    <Pause
                      size={14}
                    />
                  )}

                  {session.paused
                    ? "Resume client"
                    : "Pause client"}
                </button>

                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void loadRun(
                      session.runId,
                    )
                  }
                >
                  <RotateCw
                    size={14}
                  />
                  Refresh
                </button>

                <button
                  type="button"
                  className="button"
                  onClick={
                    resetClient
                  }
                >
                  New test
                </button>
              </>
            )}
          </div>
        </Card>

        <Card className="guided-result-card">
          <div className="guided-card-head">
            <div>
              <span>
                RESULT
              </span>

              <h2>
                {
                  verification.label
                }
              </h2>

              <p>
                {
                  verification.detail
                }
              </p>
            </div>

            {run && (
              <Badge
                tone={
                  TERMINAL.has(
                    run.status,
                  )
                    ? run.status ===
                      "completed"
                      ? "green"
                      : "amber"
                    : "blue"
                }
              >
                {statusLabel(
                  run.status,
                )}
              </Badge>
            )}
          </div>

          {!run && (
            <div className="guided-empty">
              No run yet. Select a task, adjust the sample inputs, and run it.
            </div>
          )}

          {run && (
            <div className="guided-result-body">
              <div className="guided-result-row">
                <span>
                  KIYT status
                </span>

                <strong>
                  {statusLabel(
                    run.status,
                  )}
                </strong>
              </div>

              <div className="guided-result-row">
                <span>
                  KIYT decision
                </span>

                <strong>
                  {run.decision
                    ?.action
                    ?.name ??
                    run.decision
                      ?.status ??
                    "—"}
                </strong>
              </div>

              <div className="guided-result-row">
                <span>
                  Client execution
                </span>

                <strong>
                  {latestExecution
                    ? `${latestExecution.actionName} · ${latestExecution.execution.status}`
                    : "Waiting"}
                </strong>
              </div>

              {run.decision
                ?.reason_summary && (
                <p className="guided-reason">
                  {
                    run.decision
                      .reason_summary
                  }
                </p>
              )}

              {artifact && (
                <>
                  <pre className="guided-code">
                    {pretty(
                      artifact,
                    )}
                  </pre>

                  <button
                    type="button"
                    className="button"
                    onClick={
                      downloadArtifact
                    }
                  >
                    <Download
                      size={14}
                    />
                    Download JSON
                  </button>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {run?.status ===
        "needs_input" &&
        session && (
          <Card className="guided-input-card">
            <div className="guided-card-head">
              <div>
                <span>
                  INPUT NEEDED
                </span>

                <h2>
                  KIYT needs missing business requirements
                </h2>

                <p>
                  {run.decision
                    ?.reason_summary ??
                    "Supply the missing requirements to continue the same run."}
                </p>
              </div>

              <AlertTriangle
                size={20}
              />
            </div>

            <div className="guided-input-grid">
              {session.scenarioId ===
                "hard" && (
                <>
                  <label>
                    Maximum delivery hours

                    <input
                      type="number"
                      min="1"
                      value={
                        inputHours
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputHours(
                          event
                            .target
                            .value,
                        )
                      }
                    />
                  </label>

                  <label>
                    Substitution preference

                    <select
                      value={
                        inputPreference
                      }
                      onChange={(
                        event,
                      ) =>
                        setInputPreference(
                          event
                            .target
                            .value,
                        )
                      }
                    >
                      <option value="">
                        Choose…
                      </option>

                      <option value="allow_equivalent">
                        Allow equivalent SKU
                      </option>

                      <option value="original_only">
                        Original SKU only
                      </option>
                    </select>
                  </label>
                </>
              )}

              <label className="wide">
                Additional details

                <textarea
                  rows={3}
                  value={
                    additionalDetails
                  }
                  onChange={(
                    event,
                  ) =>
                    setAdditionalDetails(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder={
                    session.scenarioId ===
                    "hard"
                      ? "Optional context for this decision."
                      : "Enter the information KIYT requested."
                  }
                />
              </label>
            </div>

            <button
              type="button"
              className="button primary"
              disabled={
                busy
              }
              onClick={
                submitInput
              }
            >
              {busy
                ? "Submitting…"
                : "Continue run"}
            </button>
          </Card>
        )}

      {error && (
        <div
          className="guided-error"
          role="alert"
        >
          <AlertTriangle
            size={16}
          />
          {error}
        </div>
      )}

      <Card className="guided-activity-card">
        <div className="guided-card-head">
          <div>
            <span>
              ACTIVITY
            </span>

            <h2>
              What actually happened
            </h2>

            <p>
              KIYT decisions and local client execution are shown separately.
            </p>
          </div>

          <Activity
            size={18}
          />
        </div>

        {!session
          ?.activity
          .length ? (
          <div className="guided-empty small">
            Activity appears after you start a real API run.
          </div>
        ) : (
          <div className="guided-activity-list">
            {session.activity.map(
              (item) => (
                <div
                  key={
                    item.id
                  }
                >
                  <span>
                    {formatTime(
                      item.at,
                    )}
                  </span>

                  <Badge
                    tone={
                      item.actor ===
                      "KIYT"
                        ? "blue"
                        : item.actor ===
                          "Client"
                          ? "green"
                          : "neutral"
                    }
                  >
                    {
                      item.actor
                    }
                  </Badge>

                  <p>
                    <strong>
                      {
                        item.title
                      }
                    </strong>

                    {
                      item.summary
                    }
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </Card>

      <div className="guided-footer-actions">
        <button
          type="button"
          className="button"
          onClick={() =>
            setApiOpen(
              (value) =>
                !value,
            )
          }
        >
          <Code2
            size={14}
          />
          API details
        </button>

        {session && (
          <Link
            className="button"
            href={`/myaccount/runs/${encodeURIComponent(session.runId)}`}
          >
            View run
          </Link>
        )}
      </div>

      {apiOpen && (
        <Card className="guided-api-card">
          <p>
            <strong>
              Browser path:
            </strong>{" "}
            this Playground uses the authenticated console bridge at{" "}
            <code>
              /api/console/cognitive/…
            </code>
            .
          </p>

          <p>
            <strong>
              Public integration:
            </strong>{" "}
            external customers use the equivalent public{" "}
            <code>
              /api/v1/runs
            </code>{" "}
            endpoints with their own Bearer API key. A browser session does not prove Bearer-key integration.
          </p>

          <p>
            <strong>
              Execution boundary:
            </strong>{" "}
            KIYT selects an allowlisted action; this sample client validates and executes the local deterministic function, then posts the observation back to the same run.
          </p>
        </Card>
      )}
    </div>
  );
}
