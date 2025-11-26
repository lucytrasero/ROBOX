import type { EventType, RoboxEvent, EventHandler } from '../types';

/**
 * Simple event emitter for Robox events
 */
export class EventEmitter {
  private handlers: Map<EventType | '*', Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event
   */
  on<T = unknown>(event: EventType | '*', handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler);
    };
  }

  /**
   * Subscribe to an event (one-time)
   */
  once<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = async (e) => {
      this.off(event, wrapper as EventHandler);
      await handler(e);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: EventType | '*', handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  async emit<T = unknown>(event: RoboxEvent<T>): Promise<void> {
    const handlers = this.handlers.get(event.type) || new Set();
    const wildcardHandlers = this.handlers.get('*') || new Set();

    const allHandlers = [...handlers, ...wildcardHandlers];

    await Promise.all(
      allHandlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          // Silently catch handler errors to prevent breaking the flow
          console.error('Event handler error:', error);
        }
      })
    );
  }

  /**
   * Remove all handlers
   */
  removeAllListeners(event?: EventType): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Get handler count for an event
   */
  listenerCount(event: EventType): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/**
 * Create a typed event
 */
export function createEvent<T>(
  type: EventType,
  data: T,
  actorId?: string
): RoboxEvent<T> {
  return {
    type,
    data,
    timestamp: new Date(),
    actorId,
  };
}
