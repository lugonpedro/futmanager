import { Route, Routes } from 'react-router'
import { FriendlyScreen } from './ui/screens/FriendlyScreen.tsx'
import { HomeScreen } from './ui/screens/HomeScreen.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/amistoso" element={<FriendlyScreen />} />
    </Routes>
  )
}
