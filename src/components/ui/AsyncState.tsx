import { Box, Button, Flex, ListItem, Skeleton, Stack, Text } from '@chakra-ui/react';

type SyncFailedBannerProps = {
    message: string;
    onRetry: () => void;
    variant?: 'subtle' | 'solid';
    compact?: boolean;
    mb?: string | number;
};

export function SyncFailedBanner({
    message,
    onRetry,
    variant = 'subtle',
    compact = false,
    mb,
}: SyncFailedBannerProps) {
    const isSolid = variant === 'solid';

    return (
        <Flex
            border={isSolid ? 'none' : '1px solid'}
            borderColor={isSolid ? undefined : 'red.300'}
            bg={isSolid ? 'red.600' : 'red.50'}
            borderRadius={isSolid ? '0' : '10px'}
            px={4}
            py={compact ? 2 : 3}
            align='center'
            justify='space-between'
            gap={3}
            mb={mb}
        >
            <Text color={isSolid ? 'white' : 'red.700'} fontWeight='600' fontSize={compact ? 'sm' : 'md'}>
                {message}
            </Text>
            <Button
                size={compact ? 'xs' : 'sm'}
                variant='outline'
                borderColor={isSolid ? 'whiteAlpha.700' : 'red.300'}
                color={isSolid ? 'white' : 'red.700'}
                _hover={{ bg: isSolid ? 'whiteAlpha.300' : 'red.100' }}
                onClick={onRetry}
            >
                Retry
            </Button>
        </Flex>
    );
}

type LoadingSkeletonRowsProps = {
    count: number;
    itemHeight: string;
    itemRadius?: string;
    itemWidth?: string;
    align?: 'stretch' | 'center';
};

export function LoadingSkeletonRows({
    count,
    itemHeight,
    itemRadius = '10px',
    itemWidth,
    align = 'stretch',
}: LoadingSkeletonRowsProps) {
    return (
        <Stack gap={2.5} align={align === 'center' ? 'center' : undefined}>
            {Array.from({ length: count }).map((_, index) => (
                <Skeleton
                    key={`skeleton-row-${index}`}
                    h={itemHeight}
                    w={itemWidth}
                    borderRadius={itemRadius}
                />
            ))}
        </Stack>
    );
}

type LoadingSkeletonListItemsProps = {
    count: number;
    itemHeight: string;
    itemRadius?: string;
};

export function LoadingSkeletonListItems({
    count,
    itemHeight,
    itemRadius = '8px',
}: LoadingSkeletonListItemsProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <ListItem key={`skeleton-list-item-${index}`}>
                    <Skeleton h={itemHeight} borderRadius={itemRadius} />
                </ListItem>
            ))}
        </>
    );
}

type EmptyCtaCardProps = {
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
    actionLoading?: boolean;
    compact?: boolean;
};

export function EmptyCtaCard({
    title,
    description,
    actionLabel,
    onAction,
    actionLoading = false,
    compact = false,
}: EmptyCtaCardProps) {
    return (
        <Box
            border='1px dashed'
            borderColor='var(--control-border)'
            borderRadius='10px'
            p={compact ? 3 : 8}
            textAlign={compact ? 'left' : 'center'}
            bg='var(--panel-bg)'
        >
            <Text fontWeight='700' fontSize={compact ? 'sm' : 'md'}>{title}</Text>
            <Text color='var(--text-muted)' mt={1} fontSize={compact ? 'xs' : 'md'}>{description}</Text>
            <Button
                mt={compact ? 2 : 4}
                size={compact ? 'xs' : 'md'}
                bg='var(--accent)'
                color='white'
                _hover={{ bg: 'var(--accent-soft)' }}
                onClick={onAction}
                loading={actionLoading}
            >
                {actionLabel}
            </Button>
        </Box>
    );
}
