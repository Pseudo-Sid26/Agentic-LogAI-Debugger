import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChakraProvider, ColorModeScript, extendTheme } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'

const theme = extendTheme({
  initialColorMode: 'light',
  useSystemColorMode: false,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <ColorModeScript initialColorMode={theme.initialColorMode} />
        <App />
      </QueryClientProvider>
    </ChakraProvider>
  </React.StrictMode>,
)
