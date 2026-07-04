#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Symbol, Vec,
};

// ── Recipient Registry Client Trait ───────────────────────────────────────────

#[soroban_sdk::contractclient(name = "RecipientRegistryClient")]
pub trait RecipientRegistryInterface {
    fn is_eligible(env: Env, recipient: Address) -> bool;
    fn mark_disbursed(env: Env, recipient: Address, amount: i128);
}

// ── Storage Key Types ─────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    Registry,
    History,
}

// ── Return Types ──────────────────────────────────────────────────────────────

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
    pub fn init(env: Env, admin: Address, token: Address, registry: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Registry, &registry);

        let empty_history: Vec<Disbursement> = Vec::new(&env);
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

    /// Disburse funds to a recipient (admin-only). Checks eligibility and cap via RecipientRegistry.
    pub fn disburse(env: Env, admin: Address, recipient: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not authorized: not the admin");
        }

        if amount <= 0 {
            panic!("disbursement amount must be positive");
        }

        // 1. Fetch registry and check eligibility via inter-contract call
        let registry_address: Address = env.storage().instance().get(&DataKey::Registry).unwrap();
        let registry_client = RecipientRegistryClient::new(&env, &registry_address);

        if !registry_client.is_eligible(&recipient) {
            panic!("recipient is not eligible");
        }

        // 2. Fetch token and check balance
        let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_id);

        let balance = token_client.balance(&env.current_contract_address());
        if balance < amount {
            panic!("insufficient fund balance");
        }

        // 3. Perform transfer
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // 4. Update recipient's total received and check cap via inter-contract call
        registry_client.mark_disbursed(&recipient, &amount);

        // 5. Record in history
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
}

// ── Unit Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::String;
    
    // Import the RecipientRegistryContract for deployment in tests
    use recipient_registry::{
        RecipientRegistryContract, RecipientRegistryContractClient,
    };

    #[test]
    fn test_relief_fund_successful_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);
        let recipient = Address::generate(&env);

        // 1. Deploy stellar asset token
        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin_client.mint(&donor, &1000);

        // 2. Deploy RecipientRegistry
        let registry_id = env.register(RecipientRegistryContract, ());
        let registry_client = RecipientRegistryContractClient::new(&env, &registry_id);

        // 3. Deploy ReliefFund
        let fund_id = env.register(ReliefFundContract, ());
        let fund_client = ReliefFundContractClient::new(&env, &fund_id);

        // 4. Initialize both
        registry_client.init(&admin, &fund_id, &500); // Max cap 500
        fund_client.init(&admin, &token_id, &registry_id);

        // Verify initial state
        assert_eq!(fund_client.get_fund_balance(), 0);
        assert_eq!(fund_client.get_disbursement_history().len(), 0);

        // Donor donates 400
        fund_client.donate(&donor, &400);
        assert_eq!(fund_client.get_fund_balance(), 400);

        // Try disburse to unregistered recipient -> fails
        let disburse_fail = fund_client.try_disburse(&admin, &recipient, &100);
        assert!(disburse_fail.is_err());

        // Register recipient
        registry_client.register_recipient(
            &admin,
            &recipient,
            &String::from_str(&env, "East-Coast"),
            &String::from_str(&env, "V-ID-1"),
        );

        // Disburse 300 -> succeeds
        fund_client.disburse(&admin, &recipient, &300);
        assert_eq!(fund_client.get_fund_balance(), 100);
        assert_eq!(token_client.balance(&recipient), 300);

        // Verify history
        let history = fund_client.get_disbursement_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().recipient, recipient);
        assert_eq!(history.get(0).unwrap().amount, 300);

        // Verify registry updated total received
        let info = registry_client.get_recipient_info(&recipient).unwrap();
        assert_eq!(info.total_received, 300);
    }

    #[test]
    #[should_panic(expected = "recipient is not eligible")]
    fn test_disburse_fails_if_unregistered() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();

        let registry_id = env.register(RecipientRegistryContract, ());
        let registry_client = RecipientRegistryContractClient::new(&env, &registry_id);

        let fund_id = env.register(ReliefFundContract, ());
        let fund_client = ReliefFundContractClient::new(&env, &fund_id);

        registry_client.init(&admin, &fund_id, &500);
        fund_client.init(&admin, &token_id, &registry_id);

        // Recipient is not registered -> panics
        fund_client.disburse(&admin, &recipient, &100);
    }

    #[test]
    #[should_panic(expected = "insufficient fund balance")]
    fn test_disburse_fails_if_insufficient_fund_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();

        let registry_id = env.register(RecipientRegistryContract, ());
        let registry_client = RecipientRegistryContractClient::new(&env, &registry_id);

        let fund_id = env.register(ReliefFundContract, ());
        let fund_client = ReliefFundContractClient::new(&env, &fund_id);

        registry_client.init(&admin, &fund_id, &500);
        fund_client.init(&admin, &token_id, &registry_id);

        registry_client.register_recipient(
            &admin,
            &recipient,
            &String::from_str(&env, "North"),
            &String::from_str(&env, "ID-9"),
        );

        // Fund has 0 balance, trying to disburse 100 -> panics
        fund_client.disburse(&admin, &recipient, &100);
    }
}
