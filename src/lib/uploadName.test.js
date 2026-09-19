import { describe, it, expect } from 'vitest'
import { uniqueId, isImageFile, imageExt } from './uploadName.js'

describe('uniqueId', () => {
  it('returns distinct non-empty ids', () => {
    const a = uniqueId(), b = uniqueId()
    expect(a).toBeTruthy(); expect(a).not.toBe(b)
  })
})

describe('isImageFile', () => {
  it('accepts normal image types', () => {
    expect(isImageFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true)
  })
  it('rejects non-images', () => {
    expect(isImageFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false)
  })
  it('accepts a camera capture with no MIME type', () => {
    expect(isImageFile({ type: '', name: 'image.jpg' })).toBe(true)
    expect(isImageFile({ type: '', name: '' })).toBe(true)
  })
  it('rejects a typeless file with a non-image name', () => {
    expect(isImageFile({ type: '', name: 'notes.txt' })).toBe(false)
  })
})

describe('imageExt', () => {
  it('maps types to extensions and defaults to jpg', () => {
    expect(imageExt({ type: 'image/jpeg', name: 'x' })).toBe('jpg')
    expect(imageExt({ type: 'image/png', name: 'x.png' })).toBe('png')
    expect(imageExt({ type: '', name: 'photo' })).toBe('jpg')
  })
})
