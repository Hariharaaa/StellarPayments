#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol, Vec, String,
};

// ── Storage Key Types ─────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    Recipients,
    History,
}

// ── Return Types ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecipientInfo {
    pub recipient: Address,
    pub name_or_id: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Disbursement {
    pub recipient: Address,
    pub amount: i128,
}

// ── Contract Implementation ───────────────────────────────────────────────────

#[contract]
pub struct ReliefFundContract;

#[contractimpl]
impl ReliefFundContract {
    /// Initialize the Relief Fund
    pub fn init(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);

        let empty_recipients: Vec<RecipientInfo> = Vec::new(&env);
        let empty_history: Vec<Disbursement> = Vec::new(&env);
        env.storage().instance().set(&DataKey::Recipients, &empty_recipients);
        env.storage().instance().set(&DataKey::History, &empty_history);
    }

    /// Donate funds (XLM/stablecoin) to the relief fund
    pub fn donate(env: Env, donor: Address, amount: i128) {
        donor.require_auth();
        if amount <= 0 {
            panic!("donation amount must be positive");
        }

        let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_id);

        // Transfer funds from donor to this contract
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        // Emit donation event
        env.events().publish(
            (Symbol::new(&env, "donation_received"), donor),
            amount,
        );
    }

    /// Register a verified recipient (admin-only)
    pub fn register_recipient(env: Env, admin: Address, recipient: Address, name_or_id: String) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not authorized: not the admin");
        }

        let mut recipients: Vec<RecipientInfo> = env.storage().instance().get(&DataKey::Recipients).unwrap();

        // Check if recipient is already registered
        for r in recipients.iter() {
            if r.recipient == recipient {
                panic!("recipient already registered");
            }
        }

        recipients.push_back(RecipientInfo {
            recipient: recipient.clone(),
            name_or_id: name_or_id.clone(),
        });
        env.storage().instance().set(&DataKey::Recipients, &recipients);

        // Emit registration event
        env.events().publish(
            (Symbol::new(&env, "recipient_registered"), recipient),
            name_or_id,
        );
    }

    /// Disburse funds to a registered recipient (admin-only)
    pub fn disburse(env: Env, admin: Address, recipient: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not authorized: not the admin");
        }

        if amount <= 0 {
            panic!("disbursement amount must be positive");
        }

        // Check if recipient is registered
        let recipients: Vec<RecipientInfo> = env.storage().instance().get(&DataKey::Recipients).unwrap();
        let mut is_registered = false;
        for r in recipients.iter() {
            if r.recipient == recipient {
                is_registered = true;
                break;
            }
        }
        if !is_registered {
            panic!("recipient is not registered");
        }

        let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_id);

        // Check fund balance
        let balance = token_client.balance(&env.current_contract_address());
        if balance < amount {
            panic!("insufficient fund balance");
        }

        // Perform payment transfer
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // Record in history
        let mut history: Vec<Disbursement> = env.storage().instance().get(&DataKey::History).unwrap();
        history.push_back(Disbursement {
            recipient: recipient.clone(),
            amount,
        });
        env.storage().instance().set(&DataKey::History, &history);

        // Emit disbursement event
        env.events().publish(
            (Symbol::new(&env, "aid_disbursed"), recipient),
            amount,
        );
    }

    /// Get current total funds in the contract
    pub fn get_fund_balance(env: Env) -> i128 {
        let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_id);
        token_client.balance(&env.current_contract_address())
    }

    /// Get all disbursements made
    pub fn get_disbursement_history(env: Env) -> Vec<Disbursement> {
        env.storage().instance().get(&DataKey::History).unwrap_or_else(|| Vec::new(&env))
    }

    /// Get all registered recipients
    pub fn get_recipients(env: Env) -> Vec<RecipientInfo> {
        env.storage().instance().get(&DataKey::Recipients).unwrap_or_else(|| Vec::new(&env))
    }
}

// ── Unit Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::String;

    #[test]
    fn test_relief_fund_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Register stellar token
        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        // Mint some test tokens to donor
        token_admin_client.mint(&donor, &1000);

        // Register and deploy ReliefFund contract
        let contract_id = env.register(ReliefFundContract, ());
        let client = ReliefFundContractClient::new(&env, &contract_id);

        // Initialize
        client.init(&admin, &token_id);

        // Verify initial state
        assert_eq!(client.get_fund_balance(), 0);
        assert_eq!(client.get_disbursement_history().len(), 0);
        assert_eq!(client.get_recipients().len(), 0);

        // Donor donates 500 XLM
        client.donate(&donor, &500);
        assert_eq!(client.get_fund_balance(), 500);
        assert_eq!(token_client.balance(&donor), 500);

        // Admin registers recipient
        let name_or_id = String::from_str(&env, "RECIPIENT_01");
        client.register_recipient(&admin, &recipient, &name_or_id);
        
        let recipients = client.get_recipients();
        assert_eq!(recipients.len(), 1);
        assert_eq!(recipients.get(0).unwrap().recipient, recipient);

        // Admin disburses 300 XLM
        client.disburse(&admin, &recipient, &300);
        assert_eq!(client.get_fund_balance(), 200);
        assert_eq!(token_client.balance(&recipient), 300);

        // Verify disbursement history
        let history = client.get_disbursement_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().recipient, recipient);
        assert_eq!(history.get(0).unwrap().amount, 300);
    }

    #[test]
    #[should_panic(expected = "recipient is not registered")]
    fn test_disburse_unregistered_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let contract_id = env.register(ReliefFundContract, ());
        let client = ReliefFundContractClient::new(&env, &contract_id);

        client.init(&admin, &token_id);
        client.disburse(&admin, &recipient, &100);
    }

    #[test]
    #[should_panic(expected = "insufficient fund balance")]
    fn test_disburse_insufficient_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let contract_id = env.register(ReliefFundContract, ());
        let client = ReliefFundContractClient::new(&env, &contract_id);

        client.init(&admin, &token_id);
        client.register_recipient(&admin, &recipient, &String::from_str(&env, "Alice"));
        client.disburse(&admin, &recipient, &100);
    }
}
