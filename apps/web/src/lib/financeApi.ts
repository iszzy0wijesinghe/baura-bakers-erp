import { apiRequest } from "./api";
export type FinanceAccount = { id:string; code:string; name:string; type:string; normalBalance:string; parentId:string|null; isActive:boolean; allowPosting:boolean };
export type FinancePeriod = { id:string; number:number; startsOn:string; endsOn:string; status:string; fiscalYearId:string; fiscalYear?:{label:string} };
export type FinanceYear = { id:string; label:string; startsOn:string; endsOn:string; periods:FinancePeriod[] };
export type TrialBalanceRow = FinanceAccount & { debit:string; credit:string };
export type FinanceJournal = {id:string; journalNo:string; description:string; accountingDate:string; status:string; lines:Array<{id:string; debit:string; credit:string; account:{code:string;name:string}}>};
export type Ledger = {account:FinanceAccount;openingBalance:string;closingBalance:string;lines:Array<{debit:string;credit:string;balance:string;journal:{journalNo:string;accountingDate:string;description:string}}>};
export const financeApi = {
  years:()=>apiRequest<FinanceYear[]>("/finance/years"),
  accounts:()=>apiRequest<FinanceAccount[]>("/finance/accounts"),
  periods:()=>apiRequest<FinancePeriod[]>("/finance/periods"),
  journals:()=>apiRequest<FinanceJournal[]>("/finance/journals?limit=100"),
  trialBalance:()=>apiRequest<TrialBalanceRow[]>("/finance/trial-balance"),
  ledger:(id:string)=>apiRequest<Ledger>(`/finance/ledger/${encodeURIComponent(id)}`),
  postJournal:(body:{journalNo:string;accountingDate:string;description:string;idempotencyKey:string;lines:Array<{accountId:string;debit:string;credit:string}>})=>apiRequest<FinanceJournal>("/finance/journals/post",{method:"POST",body:JSON.stringify(body)}),
  reverseJournal:(id:string,body:{journalNo:string;accountingDate:string})=>apiRequest<FinanceJournal>(`/finance/journals/${encodeURIComponent(id)}/reverse`,{method:"POST",body:JSON.stringify(body)}),
  createAccount:(body:{code:string;name:string;type:string;normalBalance:string;parentId?:string|null})=>apiRequest<FinanceAccount>("/finance/accounts",{method:"POST",body:JSON.stringify(body)})
};
