import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep native ES classes (FullCalendar) intact — down-leveling `extends`
  // causes "Class constructor ... cannot be invoked without 'new'".
  build: { target: 'esnext' },
})
