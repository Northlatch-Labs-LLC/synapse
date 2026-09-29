/**
 * Connector capability + dispatch helpers.
 *
 * Reads from the live connector registry (registry.ts) so there's exactly
 * one source of truth per transport_kind: the capability descriptor on
 * the registered connector instance. The legacy connectors/feishu.ts and
 * connectors/weixin.ts shells that exported standalone capability constants
 * are gone.
 *
 * `assert*` helpers throw `statusCode/code`-annotated errors so the
 * global Fastify error handler maps them to clean 400s. Bare
 * `throw new Error(...)` would surface as 500.
 */

import type {
  TransportConnectionMode,
  TransportConnectorCapability,
  TransportEndpointType,
  TransportKind,
} from "@synapse/shared/types"
import { listConnectors, tryGetConnector } from "./registry.js"
import { config } from "../../../config/index.js"
import { WESTERN_TRANSPORT_KINDS } from "@synapse/shared"

function applyWestFirstGate(
  capabilities: TransportConnectorCapability[]
): TransportConnectorCapability[] {
  if (!config.im.westernOnly) return capabilities
  return capabilities.filter((c) =>
    (WESTERN_TRANSPORT_KINDS as readonly string[]).includes(c.transportKind)
  )
}

export function listTransportConnectorCapabilities(): TransportConnectorCapability[] {
  return applyWestFirstGate(listConnectors().map((c) => c.capability))
}

export function getTransportConnectorCapability(
  transportKind: TransportKind
): TransportConnectorCapability | undefined {
  return tryGetConnector(transportKind)?.capability
}

export function assertSupportedConnectionMode(
  transportKind: TransportKind,
  connectionMode: TransportConnectionMode
): void {
  const capability = getTransportConnectorCapability(transportKind)
  if (!capability) {
    throw Object.assign(
      new Error(`No connector registered for transport_kind=${transportKind}`),
      {
        statusCode: 400 as const,
        code: "transport_kind_unsupported" as const,
      }
    )
  }
  if (!capability.supportedConnectionModes.includes(connectionMode)) {
    throw Object.assign(
      new Error(
        `${transportKind} does not support connection mode ${connectionMode}`
      ),
      {
        statusCode: 400 as const,
        code: "transport_connection_mode_unsupported" as const,
      }
    )
  }
}

export function assertSupportedEndpointType(
  transportKind: TransportKind,
  endpointType: TransportEndpointType
): void {
  const capability = getTransportConnectorCapability(transportKind)
  if (!capability) {
    throw Object.assign(
      new Error(`No connector registered for transport_kind=${transportKind}`),
      {
        statusCode: 400 as const,
        code: "transport_kind_unsupported" as const,
      }
    )
  }
  if (!capability.supportedEndpointTypes.includes(endpointType)) {
    throw Object.assign(
      new Error(
        `${transportKind} does not support endpoint type ${endpointType}`
      ),
      {
        statusCode: 400 as const,
        code: "transport_endpoint_type_unsupported" as const,
      }
    )
  }
}
