export default function PoolList() {
    return (
        <div className="flex flex-col h-full bg-zinc-100 rounded-sm mb-2 shadow-sm">
            {/* <!-- Pool list top bar --> */}
            <div className="grid grid-cols-3 w-full h-18">
                {/* <!-- Empty div for grid spacing --> */}
                <div></div>
                {/* <!-- Pool list title --> */}
                <div className="text-4xl text-center m-2 place-self-center">Pools</div>
                {/* <!-- Add event button --> */}
                <svg className="h-12 w-12 self-center justify-self-end m-4 fill-zinc-500 hover:fill-zinc-900" viewBox="0 0 24 24">
                    <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clip-rule="evenodd" />
                </svg>
            </div>
            {/* <!-- Pool list --> */}
            <div className="flex flex-col h-full m-2 rounded-sm">
                {/* <!-- First Pool --> */}
                <div className="flex flex-row bg-blue-100 m-2 rounded-sm h-18 transition
                duration-150 ease-in-out hover:-translate-y-1 hover:scale-102">
                    <div className="flex flex-col w-full">
                        {/* <!-- Name --> */}
                        <div className="text-2xl h-full w-full p-2 line-clamp-1">PPL</div>
                        {/* <!-- Hours --> */}
                        <div className="text-xl h-full w-full pl-2">
                            10
                            <span className="text-sm">hrs</span>
                        </div>
                    </div>
                </div>
                {/* <!-- Second Pool --> */}
                <div className="flex flex-row bg-red-100 m-2 rounded-sm h-18 transition
                duration-150 ease-in-out hover:-translate-y-1 hover:scale-102">
                    <div className="flex flex-col w-full">
                        {/* <!-- Name --> */}
                        <div className="text-2xl h-full w-full p-2 line-clamp-1">Floating</div>
                        {/* <!-- Hours --> */}
                        <div className="text-xl h-full w-full pl-2">
                            16
                            <span className="text-sm">hrs</span>
                        </div>
                    </div>
                </div>
            </div>
    </div>
    );
}