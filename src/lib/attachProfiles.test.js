import { describe, expect, it, vi } from 'vitest'
import { attachProfiles } from './attachProfiles.js'

function fakeSupabase(profiles) {
  const inFn = vi.fn(async () => ({ data: profiles, error: null }))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  return { client: { from }, from, select, inFn }
}

describe('attachProfiles', () => {
  it('adds sender and courier from one profiles lookup', async () => {
    const s = fakeSupabase([
      { id: 'a', first_name: 'Ann' },
      { id: 'b', first_name: 'Bo' },
    ])
    const rows = [
      { id: 1, sender_id: 'a', courier_id: 'b' },
      { id: 2, sender_id: 'a', courier_id: null },
    ]
    const out = await attachProfiles(s.client, rows)
    expect(s.from).toHaveBeenCalledWith('profiles')
    expect(s.inFn).toHaveBeenCalledTimes(1)
    expect(s.inFn.mock.calls[0][1].sort()).toEqual(['a', 'b'])
    expect(out[0].sender.first_name).toBe('Ann')
    expect(out[0].courier.first_name).toBe('Bo')
    expect(out[1].courier).toBeNull()
  })

  it('skips the lookup when there are no rows', async () => {
    const s = fakeSupabase([])
    expect(await attachProfiles(s.client, [])).toEqual([])
    expect(s.from).not.toHaveBeenCalled()
  })

  it('leaves names empty when the lookup fails', async () => {
    const inFn = vi.fn(async () => ({ data: null, error: { message: 'nope' } }))
    const client = { from: () => ({ select: () => ({ in: inFn }) }) }
    const out = await attachProfiles(client, [{ id: 1, sender_id: 'a', courier_id: null }])
    expect(out).toEqual([{ id: 1, sender_id: 'a', courier_id: null, sender: null, courier: null }])
  })
})
