import { Card, CardBody, Flex, Heading, Skeleton, Stat, StatHelpText, StatLabel, StatNumber, useColorModeValue } from '@chakra-ui/react'

interface Metrics {
  errors: [string, number][]
  warnings: [string, number][]
  info: [string, number][]
}

export function MetricsCards({ metrics, loading }: { metrics?: Metrics; loading?: boolean }) {
  const bg = useColorModeValue('white', 'gray.800')
  const latest = (s?: [string, number][]) => (s && s.length ? s[s.length - 1][1] : 0)

  return (
    <Flex gap={4} wrap="wrap">
      {[{ key: 'errors', color: 'red' }, { key: 'warnings', color: 'yellow' }, { key: 'info', color: 'blue' }].map(
        (k) => (
          <Card key={k.key} bg={bg} shadow="sm" flex="1 1 220px" minW="220px">
            <CardBody>
              {loading ? (
                <Skeleton height="64px" />
              ) : (
                <Stat>
                  <StatLabel textTransform="capitalize">{k.key}</StatLabel>
                  <StatNumber color={`${k.color}.400`}>{latest(metrics?.[k.key as keyof Metrics])}</StatNumber>
                  <StatHelpText>Last updated just now</StatHelpText>
                </Stat>
              )}
            </CardBody>
          </Card>
        ),
      )}
    </Flex>
  )
}
