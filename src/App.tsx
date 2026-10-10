import { Route, Routes } from 'react-router'
import { HomeScreen } from './ui/screens/HomeScreen.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
    </Routes>
  )
}
