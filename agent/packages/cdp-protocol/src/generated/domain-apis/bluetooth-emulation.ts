/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type {
  AddCharacteristicParams,
  AddCharacteristicResult,
  AddDescriptorParams,
  AddDescriptorResult,
  AddServiceParams,
  AddServiceResult,
  CharacteristicOperationReceivedEvent,
  DescriptorOperationReceivedEvent,
  EnableParams,
  GattOperationReceivedEvent,
  RemoveCharacteristicParams,
  RemoveDescriptorParams,
  RemoveServiceParams,
  SetSimulatedCentralStateParams,
  SimulateAdvertisementParams,
  SimulateCharacteristicOperationResponseParams,
  SimulateDescriptorOperationResponseParams,
  SimulateGATTDisconnectionParams,
  SimulateGATTOperationResponseParams,
  SimulatePreconnectedPeripheralParams,
} from '../domains/bluetooth-emulation'

export interface BluetoothEmulationApi {
  // ── Commands ──

  enable(params: EnableParams): Promise<void>
  setSimulatedCentralState(
    params: SetSimulatedCentralStateParams,
  ): Promise<void>
  disable(): Promise<void>
  simulatePreconnectedPeripheral(
    params: SimulatePreconnectedPeripheralParams,
  ): Promise<void>
  simulateAdvertisement(params: SimulateAdvertisementParams): Promise<void>
  simulateGATTOperationResponse(
    params: SimulateGATTOperationResponseParams,
  ): Promise<void>
  simulateCharacteristicOperationResponse(
    params: SimulateCharacteristicOperationResponseParams,
  ): Promise<void>
  simulateDescriptorOperationResponse(
    params: SimulateDescriptorOperationResponseParams,
  ): Promise<void>
  addService(params: AddServiceParams): Promise<AddServiceResult>
  removeService(params: RemoveServiceParams): Promise<void>
  addCharacteristic(
    params: AddCharacteristicParams,
  ): Promise<AddCharacteristicResult>
  removeCharacteristic(params: RemoveCharacteristicParams): Promise<void>
  addDescriptor(params: AddDescriptorParams): Promise<AddDescriptorResult>
  removeDescriptor(params: RemoveDescriptorParams): Promise<void>
  simulateGATTDisconnection(
    params: SimulateGATTDisconnectionParams,
  ): Promise<void>

  // ── Events ──

  on(
    event: 'gattOperationReceived',
    handler: (params: GattOperationReceivedEvent) => void,
  ): () => void
  on(
    event: 'characteristicOperationReceived',
    handler: (params: CharacteristicOperationReceivedEvent) => void,
  ): () => void
  on(
    event: 'descriptorOperationReceived',
    handler: (params: DescriptorOperationReceivedEvent) => void,
  ): () => void
}
