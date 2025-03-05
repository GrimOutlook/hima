import { Label } from "@headlessui/react"

type PoolDetailsOverlayProps = {
    pool: number;
}

export const PoolDetailsOverlay: React.FC<PoolDetailsOverlayProps> = ({pool}) => {

    return (
        <div className="size-32 bg-red-500"/>
    )
}