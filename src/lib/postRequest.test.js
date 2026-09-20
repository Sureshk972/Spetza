import { describe, expect, it } from 'vitest'
import { postDeliveryRequest } from './postRequest.js'

// Hand-rolled stand-in for the supabase client: records every call and
// answers each table with the canned result it was given.
function fakeClient({ requestInsert, contactInsert, requestDelete } = {}) {
  const calls = []
  const client = {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.push({ table, op: 'insert', row })
          if (table === 'delivery_requests') {
            const result = requestInsert ?? { data: { id: 'req-1' }, error: null }
            return { select: () => ({ single: async () => result }) }
          }
          return Promise.resolve(contactInsert ?? { error: null })
        },
        delete() {
          return {
            eq: async (col, val) => {
              calls.push({ table, op: 'delete', col, val })
              return requestDelete ?? { error: null }
            },
          }
        },
      }
    },
  }
  return client
}

const row = { sender_id: 'u1', kind: 'send', pickup_address: 'A', dropoff_address: 'B' }

describe('postDeliveryRequest', () => {
  it('send-kind: one insert, no contact write', async () => {
    const client = fakeClient()
    const result = await postDeliveryRequest(client, row, null)
    expect(result).toEqual({ id: 'req-1', error: null })
    expect(client.calls).toEqual([{ table: 'delivery_requests', op: 'insert', row }])
  })

  it('pickup-kind: inserts the contact keyed to the new request', async () => {
    const client = fakeClient()
    const contact = { name: 'Joe', phone: '+13125550100' }
    const result = await postDeliveryRequest(client, { ...row, kind: 'pickup' }, contact)
    expect(result).toEqual({ id: 'req-1', error: null })
    expect(client.calls[1]).toEqual({
      table: 'delivery_pickup_contacts',
      op: 'insert',
      row: { delivery_request_id: 'req-1', name: 'Joe', phone: '+13125550100' },
    })
    expect(client.calls).toHaveLength(2)
  })

  it('contact insert failure deletes the request and returns that error', async () => {
    const contactErr = { message: 'phone check failed' }
    const client = fakeClient({ contactInsert: { error: contactErr } })
    const result = await postDeliveryRequest(client, { ...row, kind: 'pickup' }, { name: 'Joe', phone: 'x' })
    expect(result).toEqual({ id: null, error: contactErr })
    expect(client.calls[2]).toEqual({ table: 'delivery_requests', op: 'delete', col: 'id', val: 'req-1' })
  })

  it('request insert failure returns that error without touching contacts', async () => {
    const reqErr = { message: 'rls denied' }
    const client = fakeClient({ requestInsert: { data: null, error: reqErr } })
    const result = await postDeliveryRequest(client, { ...row, kind: 'pickup' }, { name: 'Joe', phone: 'x' })
    expect(result).toEqual({ id: null, error: reqErr })
    expect(client.calls).toEqual([{ table: 'delivery_requests', op: 'insert', row: { ...row, kind: 'pickup' } }])
  })
})
