type PPLPool = {
    // Name of the PPL pool
    name: string;
    // More detailed description of 
    description: string;
    // Amount of PPL to accrue per period
    amount: number;
    // Period of time between when amounts of PPL accrue
    period: Period;
    // Date that the accrual starts
    startDate: Date;
}