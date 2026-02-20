/**
 * Registry for connected programs on the connector bus.
 * Tracks program names, capabilities, and WebSocket references.
 */

import { WebSocket } from 'ws'

export interface RegisteredProgram {
  connectionId: string
  name: string
  capabilities: string[]
  ws: WebSocket
  connectedAt: number
}

export const MAX_PROGRAMS = 100

export class ProgramRegistry {
  private programs: Map<string, RegisteredProgram> = new Map()

  /** Register a new program */
  register(
    connectionId: string,
    ws: WebSocket,
    name: string,
    capabilities: string[]
  ): void {
    // Allow re-registration of existing connections
    if (!this.programs.has(connectionId) && this.programs.size >= MAX_PROGRAMS) {
      throw new Error(`Maximum number of programs (${MAX_PROGRAMS}) reached`)
    }
    // Reject if a different connection already registered this program name
    const existing = this.getByName(name)
    if (existing && existing.connectionId !== connectionId) {
      throw new Error(`Program name '${name}' is already registered by another connection`)
    }
    // If same connection re-registers, update
    this.programs.set(connectionId, {
      connectionId,
      name,
      capabilities,
      ws,
      connectedAt: Date.now()
    })
  }

  /** Unregister by connection ID */
  unregisterByConnectionId(connectionId: string): void {
    this.programs.delete(connectionId)
  }

  /** Unregister by program name */
  unregisterByName(name: string): void {
    for (const [id, program] of this.programs) {
      if (program.name === name) {
        this.programs.delete(id)
      }
    }
  }

  /** Get a program by name */
  getByName(name: string): RegisteredProgram | undefined {
    for (const program of this.programs.values()) {
      if (program.name === name) return program
    }
    return undefined
  }

  /** Get all programs with a specific capability */
  getByCapability(capability: string): RegisteredProgram[] {
    return Array.from(this.programs.values()).filter(p =>
      p.capabilities.includes(capability)
    )
  }

  /** List all registered programs */
  listPrograms(): RegisteredProgram[] {
    return Array.from(this.programs.values())
  }

  /** Get count of registered programs */
  get size(): number {
    return this.programs.size
  }

  /** Clear all registrations */
  clear(): void {
    this.programs.clear()
  }
}
