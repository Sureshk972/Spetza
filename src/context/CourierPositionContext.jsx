import { createContext, useContext } from 'react'
import { useCourierPosition } from '../hooks/useCourierPosition.js'

// One position watcher per app, owned by CourierLayout. Pages and hooks read
// it from here rather than each asking the phone (and the user) themselves.
const CourierPositionContext = createContext({ fix: null, status: 'idle' })

export function CourierPositionProvider({ children }) {
  const value = useCourierPosition()
  return <CourierPositionContext.Provider value={value}>{children}</CourierPositionContext.Provider>
}

export function useCourierPositionContext() {
  return useContext(CourierPositionContext)
}
