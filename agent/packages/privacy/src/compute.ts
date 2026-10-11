/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/compute.ts (MIT).
 */

/*
 * Exact arithmetic on the real values behind privacy labels, for the `privacy_compute` tool the
 * privacy gate plugin gives the model (opencode-plugins/redrob-privacy-gate.ts).
 *
 * The model reads labels and, when a team policy rounds amounts, approximations such as
 * `[AMOUNT_3](≈₩12,000,000)`. It cannot add up what it cannot see, so it writes the sum with the
 * labels, `[AMOUNT_3] + [AMOUNT_7]`, and the tool runs on this machine. By then the gate has put the
 * real values back into the tool's arguments, so this module only ever sees ordinary amounts,
 * percentages and dates. Its answer goes back to the model through the gate like any tool result,
 * so an exact amount in it is rounded and labelled again where the policy says so.
 *
 * A small parser, not `eval`: numbers, amounts with a currency, percentages, + - * /, parentheses,
 * one comparison, and sum / min / max / abs / round / days.
 */

export type ComputeResult = {
  value: number | boolean
  currency: string | null
  text: string
}

export class ComputeError extends Error {}

type Value =
  | { kind: 'number'; value: number; currency: string | null }
  | { kind: 'date'; days: number }

const PREFIX_CURRENCIES = ['USD', 'KRW', '₩', '$', '€', '£'] as const
const SUFFIX_CURRENCIES = ['달러', 'USD', 'KRW', '원'] as const
/** How each currency is written back: before the number or after it. */
const CURRENCY_FORMS: Record<string, { prefix?: string; suffix?: string }> = {
  '₩': { prefix: '₩' },
  $: { prefix: '$' },
  '€': { prefix: '€' },
  '£': { prefix: '£' },
  USD: { prefix: 'USD ' },
  KRW: { prefix: 'KRW ' },
  원: { suffix: '원' },
  달러: { suffix: '달러' },
}

const FUNCTIONS = new Set(['sum', 'min', 'max', 'abs', 'round', 'days'])
const MAX_LENGTH = 2_000

const DATE_ISO = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/
const DATE_KO = /^(\d{4})년\s?(\d{1,2})월\s?(\d{1,2})일/
const NUMBER = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/

function dayNumber(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new ComputeError(`not a date: ${year}-${month}-${day}`)
  return Math.round(date.getTime() / 86_400_000)
}

class Parser {
  private index = 0

  constructor(private readonly source: string) {}

  private skip() {
    while (
      this.index < this.source.length &&
      /\s/.test(this.source[this.index])
    )
      this.index += 1
  }

  private rest() {
    this.skip()
    return this.source.slice(this.index)
  }

  private eat(token: string): boolean {
    if (this.rest().startsWith(token)) {
      this.index += token.length
      return true
    }
    return false
  }

  private fail(what: string): never {
    const near = this.rest().slice(0, 24)
    throw new ComputeError(near ? `${what} at "${near}"` : `${what} at the end`)
  }

  parse(): boolean | Value {
    const left = this.expression()
    for (const op of ['>=', '<=', '==', '!=', '>', '<']) {
      if (this.eat(op)) {
        const right = this.expression()
        const [a, b] = [number(left), number(right)]
        sameCurrency(left, right)
        const results: Record<string, boolean> = {
          '>=': a >= b,
          '<=': a <= b,
          '==': a === b,
          '!=': a !== b,
          '>': a > b,
          '<': a < b,
        }
        const result = results[op]
        if (this.rest()) this.fail('unexpected text')
        return result
      }
    }
    if (this.rest()) this.fail('unexpected text')
    return left
  }

  private expression(): Value {
    let left = this.term()
    for (;;) {
      if (this.eat('+'))
        left = combine(left, this.term(), (a, b) => a + b, 'add')
      else if (this.eat('-')) left = subtract(left, this.term())
      else return left
    }
  }

  private term(): Value {
    let left = this.factor()
    for (;;) {
      if (this.eat('*') || this.eat('×'))
        left = scale(left, this.factor(), (a, b) => a * b)
      else if (this.eat('/') || this.eat('÷')) {
        const right = this.factor()
        if (number(right) === 0) throw new ComputeError('division by zero')
        left = scale(left, right, (a, b) => a / b, true)
      } else return left
    }
  }

  private factor(): Value {
    if (this.eat('-')) {
      const value = this.factor()
      return {
        kind: 'number',
        value: -number(value),
        currency: currencyOf(value),
      }
    }
    if (this.eat('+')) return this.factor()
    return this.primary()
  }

  private primary(): Value {
    const rest = this.rest()
    if (this.eat('(')) {
      const value = this.expression()
      if (!this.eat(')')) this.fail('missing )')
      return value
    }
    const name = /^([a-z]+)\s*\(/i.exec(rest)
    if (name && FUNCTIONS.has(name[1].toLowerCase())) {
      this.index += name[0].length
      return this.call(name[1].toLowerCase())
    }
    for (const pattern of [DATE_KO, DATE_ISO]) {
      const date = pattern.exec(rest)
      if (date) {
        this.index += date[0].length
        return {
          kind: 'date',
          days: dayNumber(Number(date[1]), Number(date[2]), Number(date[3])),
        }
      }
    }
    let currency: string | null = null
    for (const prefix of PREFIX_CURRENCIES) {
      if (rest.startsWith(prefix)) {
        currency = prefix
        this.index += prefix.length
        break
      }
    }
    const digits = NUMBER.exec(this.rest())
    if (!digits) this.fail('expected a number')
    this.index += digits[0].length
    let value = Number(`${digits[1].replace(/,/g, '')}${digits[2] ?? ''}`)
    const after = this.source.slice(this.index)
    if (/^\s?%/.test(after)) {
      this.index += after.indexOf('%') + 1
      value /= 100
    } else if (!currency) {
      for (const suffix of SUFFIX_CURRENCIES) {
        const match = new RegExp(`^\\s?${suffix}`).exec(after)
        if (match) {
          currency = suffix
          this.index += match[0].length
          break
        }
      }
    }
    return { kind: 'number', value, currency }
  }

  private call(name: string): Value {
    const args: Value[] = []
    if (!this.eat(')')) {
      do args.push(this.expression())
      while (this.eat(','))
      if (!this.eat(')')) this.fail('missing )')
    }
    if (name === 'days') {
      if (args.length !== 2 || args.some((arg) => arg.kind !== 'date'))
        throw new ComputeError('days() takes two dates')
      const [from, to] = args as Array<{ kind: 'date'; days: number }>
      return { kind: 'number', value: to.days - from.days, currency: null }
    }
    if (!args.length) throw new ComputeError(`${name}() needs a value`)
    if (name === 'round') {
      if (args.length > 2)
        throw new ComputeError(
          'round() takes a value and, optionally, decimal places',
        )
      const places = args[1] ? number(args[1]) : 0
      if (!Number.isInteger(places) || places < 0 || places > 6)
        throw new ComputeError('round() takes 0 to 6 decimal places')
      const factor = 10 ** places
      return {
        kind: 'number',
        value: Math.round(number(args[0]) * factor) / factor,
        currency: currencyOf(args[0]),
      }
    }
    if (name === 'abs') {
      if (args.length !== 1) throw new ComputeError('abs() takes one value')
      return {
        kind: 'number',
        value: Math.abs(number(args[0])),
        currency: currencyOf(args[0]),
      }
    }
    const currency = args.reduce<string | null>(
      (found, arg) =>
        sameCurrency({ kind: 'number', value: 0, currency: found }, arg),
      null,
    )
    const values = args.map(number)
    const value =
      name === 'sum'
        ? values.reduce((a, b) => a + b, 0)
        : name === 'min'
          ? Math.min(...values)
          : Math.max(...values)
    return { kind: 'number', value, currency }
  }
}

function number(value: Value): number {
  if (value.kind === 'date')
    throw new ComputeError(
      'a date is not a number; use days(from, to) for the days between two dates',
    )
  return value.value
}

const currencyOf = (value: Value) =>
  value.kind === 'number' ? value.currency : null

function sameCurrency(a: Value, b: Value): string | null {
  const [x, y] = [currencyOf(a), currencyOf(b)]
  if (x && y && x !== y)
    throw new ComputeError(
      `mixes currencies (${x} and ${y}); convert one first`,
    )
  return x ?? y
}

function combine(
  a: Value,
  b: Value,
  op: (x: number, y: number) => number,
  verb: string,
): Value {
  if (a.kind === 'date' || b.kind === 'date')
    throw new ComputeError(`cannot ${verb} dates; use days(from, to)`)
  return {
    kind: 'number',
    value: op(a.value, b.value),
    currency: sameCurrency(a, b),
  }
}

/** A date minus a date is the days between them; anything else is ordinary subtraction. */
function subtract(a: Value, b: Value): Value {
  if (a.kind === 'date' && b.kind === 'date')
    return { kind: 'number', value: a.days - b.days, currency: null }
  return combine(a, b, (x, y) => x - y, 'subtract')
}

/** Multiplying or dividing keeps the amount's currency; an amount divided by an amount is a ratio. */
function scale(
  a: Value,
  b: Value,
  op: (x: number, y: number) => number,
  dividing = false,
): Value {
  const value = op(number(a), number(b))
  const [x, y] = [currencyOf(a), currencyOf(b)]
  if (dividing && x && y) {
    sameCurrency(a, b)
    return { kind: 'number', value, currency: null }
  }
  if (x && y) throw new ComputeError('cannot multiply two amounts')
  return { kind: 'number', value, currency: x ?? y }
}

function format(value: number, currency: string | null): string {
  const rounded = Math.round(value * 100) / 100
  const digits = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (!currency) return digits
  const form = CURRENCY_FORMS[currency] ?? { suffix: ` ${currency}` }
  const sign = digits.startsWith('-') ? '-' : ''
  const body = sign ? digits.slice(1) : digits
  return `${sign}${form.prefix ?? ''}${body}${form.suffix ?? ''}`
}

/** Evaluates one expression. Throws ComputeError, with where it stopped, for anything it cannot read. */
export function compute(expression: string): ComputeResult {
  const source = expression.trim()
  if (!source) throw new ComputeError('the expression is empty')
  if (source.length > MAX_LENGTH)
    throw new ComputeError(
      `the expression is longer than ${MAX_LENGTH} characters`,
    )
  const result = new Parser(source).parse()
  if (typeof result === 'boolean')
    return { value: result, currency: null, text: String(result) }
  if (result.kind === 'date')
    throw new ComputeError(
      'the result is a date; use days(from, to) for the days between two dates',
    )
  if (!Number.isFinite(result.value))
    throw new ComputeError('the result is not a finite number')
  return {
    value: result.value,
    currency: result.currency,
    text: format(result.value, result.currency),
  }
}
