import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hapticLight, hapticMedium, hapticSuccess, hapticError } from './haptics'

describe('haptics.ts', () => {
  const mockVibrate = vi.fn()

  beforeEach(() => {
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      value: mockVibrate,
      writable: true,
      configurable: true,
    })
    mockVibrate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('hapticLight', () => {
    it('should call vibrate with 10ms duration', () => {
      hapticLight()
      expect(mockVibrate).toHaveBeenCalledWith(10)
    })
  })

  describe('hapticMedium', () => {
    it('should call vibrate with 25ms duration', () => {
      hapticMedium()
      expect(mockVibrate).toHaveBeenCalledWith(25)
    })
  })

  describe('hapticSuccess', () => {
    it('should call vibrate with pattern [15, 50, 15]', () => {
      hapticSuccess()
      expect(mockVibrate).toHaveBeenCalledWith([15, 50, 15])
    })
  })

  describe('hapticError', () => {
    it('should call vibrate with pattern [50, 30, 50]', () => {
      hapticError()
      expect(mockVibrate).toHaveBeenCalledWith([50, 30, 50])
    })
  })

  describe('when vibration is not supported', () => {
    beforeEach(() => {
      // Create a navigator-like object without vibrate
      const navigatorWithoutVibrate = { ...navigator }
      delete (navigatorWithoutVibrate as Partial<Navigator>).vibrate
      Object.defineProperty(global, 'navigator', {
        value: navigatorWithoutVibrate,
        writable: true,
        configurable: true,
      })
    })

    afterEach(() => {
      // Restore navigator with vibrate mock
      Object.defineProperty(navigator, 'vibrate', {
        value: mockVibrate,
        writable: true,
        configurable: true,
      })
    })

    it('hapticLight should not throw', () => {
      expect(() => hapticLight()).not.toThrow()
    })

    it('hapticMedium should not throw', () => {
      expect(() => hapticMedium()).not.toThrow()
    })

    it('hapticSuccess should not throw', () => {
      expect(() => hapticSuccess()).not.toThrow()
    })

    it('hapticError should not throw', () => {
      expect(() => hapticError()).not.toThrow()
    })
  })
})
