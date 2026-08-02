// Bound work by SILENCE, not by elapsed time.
//
// A wall-clock ceiling on a download is a bug with a bandwidth threshold. It
// cannot tell "this is stuck" from "this user's connection is slow", so it picks
// a speed below which the product simply refuses to work — and picks it
// invisibly, in a constant, for everyone. AML-Filter has hit this twice: once on
// the 46 MB bundle sync, and once on the 23 MB model, which died at 120 s on any
// link under ~2 Mbps while making perfectly steady progress.
//
// The fix both times is the same shape. Keep a deadline, but reset it on every
// piece of proof-of-life. A transfer that is moving never trips it however long
// it takes; a transfer that has genuinely stopped still trips it in one window.
//
// This module is that shape, extracted. `EngineClient` had it open-coded in a
// private `Pending.rearm` closure; it now uses this, so the primitive has two
// production callers and one definition.

/** A deadline that proof-of-life postpones. */
export interface IdleTimer {
	/** Proof of life: restart the idle window. No-op once cancelled or expired. */
	readonly tick: () => void;
	/** Stop the timer for good (the work settled, or its owner was torn down). */
	readonly cancel: () => void;
}

/**
 * Start an idle timer. `onExpire` fires when `idleMs` passes with no `tick()`.
 *
 * It fires AT MOST ONCE: an expiry that has already been reported must not be
 * reported again by a later stray timer, and a cancelled timer must never fire
 * at all. Both matter because the callers use `onExpire` to reject a promise.
 */
export function startIdleTimer(
	idleMs: number,
	onExpire: () => void,
): IdleTimer {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let done = false;
	const arm = (): void => {
		timer = setTimeout(() => {
			if (done) {
				return;
			}
			done = true;
			onExpire();
		}, idleMs);
	};
	arm();
	return {
		tick: () => {
			if (done) {
				return;
			}
			clearTimeout(timer);
			arm();
		},
		cancel: () => {
			done = true;
			clearTimeout(timer);
		},
	};
}

/** A promise bounded by silence, plus the handle that feeds it proof of life. */
export interface IdleBounded<T> {
	readonly promise: Promise<T>;
	/** Call on every observable sign of progress. */
	readonly tick: () => void;
}

/**
 * Bound `work` by silence: reject with `message` only after `idleMs` elapses
 * with no `tick()`. A `tick()` stream that never stops means `work` is never
 * rejected, which is exactly the point — a slow-but-moving download must be
 * allowed to finish.
 *
 * The idle window must therefore exceed the longest legitimate GAP the work can
 * contain, not its longest legitimate DURATION. Callers own that judgement and
 * should say what gap they are covering.
 */
export function withIdleTimeout<T>(
	work: Promise<T>,
	idleMs: number,
	message: string,
): IdleBounded<T> {
	let timer: IdleTimer | undefined;
	const bounded = new Promise<never>((_resolve, reject) => {
		timer = startIdleTimer(idleMs, () => {
			reject(new Error(message));
		});
	});
	return {
		promise: Promise.race([work, bounded]).finally(() => {
			timer?.cancel();
		}),
		tick: () => {
			timer?.tick();
		},
	};
}
