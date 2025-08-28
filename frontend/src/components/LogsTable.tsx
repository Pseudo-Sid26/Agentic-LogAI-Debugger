import { Box, Card, CardBody, Flex, HStack, Skeleton, Tag, Text, useColorModeValue } from '@chakra-ui/react'

interface Props {
  items: Array<{
    timestamp: string
    message: string
    level: 'error' | 'warning' | 'info'
    service: string
  }>
  loading?: boolean
}

const levelColor: Record<string, string> = {
  error: 'red',
  warning: 'yellow',
  info: 'blue',
}

export function LogsTable({ items, loading }: Props) {
  const cardBg = useColorModeValue('white', 'gray.800')

  return (
    <Card bg={cardBg} shadow="sm">
      <CardBody>
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height="28px" my={2} />
            ))}
          </>
        ) : (
          <Box>
            {items.map((i, idx) => (
              <Flex key={idx} py={2} borderBottomWidth={idx < items.length - 1 ? '1px' : undefined} gap={3} align="start">
                <Text fontFamily="mono" fontSize="sm" minW="210px">
                  {new Date(i.timestamp).toLocaleString()}
                </Text>
                <HStack>
                  <Tag size="sm" colorScheme={levelColor[i.level] || 'gray'}>
                    {i.level}
                  </Tag>
                </HStack>
                <Text flex="1" whiteSpace="pre-wrap">
                  {i.message}
                </Text>
                <Text color="gray.500" minW="180px" textAlign="right">
                  {i.service}
                </Text>
              </Flex>
            ))}
            {items.length === 0 && <Text color="gray.500">No logs found.</Text>}
          </Box>
        )}
      </CardBody>
    </Card>
  )
}
