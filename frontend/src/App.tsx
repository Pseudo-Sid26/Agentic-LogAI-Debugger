import { Box, Container, Flex, Heading, HStack, IconButton, Spacer, Text, useColorMode, VStack, Badge, Input, Select, Button, useColorModeValue } from '@chakra-ui/react'
import { MoonIcon, SunIcon, RepeatIcon } from '@chakra-ui/icons'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useMemo, useState } from 'react'
import { LogsTable } from './components/LogsTable'
import { MetricsCards } from './components/MetricsCards'

interface LogItem {
  timestamp: string
  message: string
  level: 'error' | 'warning' | 'info'
  service: string
}

interface Metrics {
  errors: [string, number][]
  warnings: [string, number][]
  info: [string, number][]
}

const timeRanges = [
  { label: 'Last 24 hours', minutes: 24 * 60 },
  { label: 'Last 7 days', minutes: 7 * 24 * 60 },
  { label: 'Last 30 days', minutes: 30 * 24 * 60 },
]

export default function App() {
  const { colorMode, toggleColorMode } = useColorMode()
  const [minutes, setMinutes] = useState(timeRanges[0].minutes)
  const [search, setSearch] = useState('')

  const { data: logsData, isFetching: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['logs', minutes],
    queryFn: async () => {
      const res = await axios.get(`/api/logs`, { params: { minutes, limit: 1000 } })
      return res.data as { items: LogItem[]; count: number }
    },
    refetchInterval: 15_000,
  })

  const { data: metricsData, isFetching: metricsLoading } = useQuery({
    queryKey: ['metrics', minutes],
    queryFn: async () => {
      const res = await axios.get(`/api/metrics`, { params: { minutes } })
      return res.data as Metrics
    },
    refetchInterval: 30_000,
  })

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logsData?.items ?? []
    return (logsData?.items ?? []).filter((i) =>
      i.message.toLowerCase().includes(q) || i.service.toLowerCase().includes(q),
    )
  }, [logsData, search])

  const bg = useColorModeValue('gray.50', 'gray.900')

  return (
    <Box minH="100vh" bg={bg}>
      <Box as="header" borderBottomWidth="1px" py={2} px={4} bg={useColorModeValue('white', 'gray.800')}>
        <Flex align="center" gap={3}>
          <Heading size="md">LogAnalytics</Heading>
          <Badge colorScheme="purple">React</Badge>
          <Spacer />
          <HStack>
            <IconButton aria-label="Toggle color mode" size="sm" onClick={toggleColorMode} icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />} />
          </HStack>
        </Flex>
      </Box>

      <Container maxW="7xl" py={6}>
        <VStack align="stretch" spacing={4}>
          <Flex gap={3} align="center" wrap="wrap">
            <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} maxW="md" />
            <Select maxW="xs" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {timeRanges.map((t) => (
                <option key={t.minutes} value={t.minutes}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button leftIcon={<RepeatIcon />} onClick={() => { refetchLogs() }} isLoading={logsLoading}>
              Refresh
            </Button>
          </Flex>

          <MetricsCards metrics={metricsData} loading={metricsLoading} />

          <LogsTable items={filteredItems} loading={logsLoading} />
        </VStack>
      </Container>
    </Box>
  )
}
