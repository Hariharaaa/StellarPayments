#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol, Vec, String,
};

// ── Storage Key Types ─────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    FundContract,
    MaxCap,
    Recipient(Address),
    RecipientList,
}

// ── Record Types ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecipientRecord {
    pub region: String,
    pub verification_id: String,
    pub total_received: i128,
    pub verified: bool,
}

// ── Contract Implementation ───────────────────────────────────────────────────

#[contract]
pub struct RecipientRegistryContract;

#[contractimpl]
impl RecipientRegistryContract {
    /// Initialize the Recipient Registry
    pub fn init(env: Env, admin: Address, fund_contract: Address, max_cap: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        if max_cap <= 0 {
            panic!("max cap must be positive");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FundContract, &fund_contract);
        env.storage().instance().set(&DataKey::MaxCap, &max_cap);

        let empty_list: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&DataKey::RecipientList, &empty_list);
    }

    /// Register a verified recipient (admin-only)
    pub fn register_recipient(
        env: Env,
        admin: Address,
        recipient: Address,
        region: String,
        verification_id: String,
    ) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not authorized: not the admin");
        }

        let key = DataKey::Recipient(recipient.clone());
        if env.storage().instance().has(&key) {
            panic!("recipient already registered");
        }

        let record = RecipientRecord {
            region,
            verification_id: verification_id.clone(),
            total_received: 0,
            verified: true,
        };
        env.storage().instance().set(&key, &record);

        // Add to recipient list
        let mut list: Vec<Address> = env.storage().instance().get(&DataKey::RecipientList).unwrap();
        list.push_back(recipient.clone());
        env.storage().instance().set(&DataKey::RecipientList, &list);

        // Emit registration event
        env.events().publish(
            (Symbol::new(&env, "recipient_registered"), recipient),
            verification_id,
        );
    }

    /// Check if a recipient is eligible for disbursement
    pub fn is_eligible(env: Env, recipient: Address) -> bool {
        let key = DataKey::Recipient(recipient);
        if !env.storage().instance().has(&key) {
            return false;
        }

        let record: RecipientRecord = env.storage().instance().get(&key).unwrap();
        let max_cap: i128 = env.storage().instance().get(&DataKey::MaxCap).unwrap();

        record.verified && record.total_received < max_cap
    }

    /// Record a disbursement and check against max cap. Called only by ReliefFund contract.
    pub fn mark_disbursed(env: Env, recipient: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Authenticate that the caller is the registered ReliefFund contract
        let fund_contract: Address = env.storage().instance().get(&DataKey::FundContract).unwrap();
        fund_contract.require_auth();

        let key = DataKey::Recipient(recipient);
        if !env.storage().instance().has(&key) {
            panic!("recipient is not registered");
        }

        let mut record: RecipientRecord = env.storage().instance().get(&key).unwrap();
        let max_cap: i128 = env.storage().instance().get(&DataKey::MaxCap).unwrap();

        if record.total_received + amount > max_cap {
            panic!("disbursement cap exceeded");
        }

        record.total_received += amount;
        env.storage().instance().set(&key, &record);
    }

    /// Read recipient record
    pub fn get_recipient_info(env: Env, recipient: Address) -> Option<RecipientRecord> {
        let key = DataKey::Recipient(recipient);
        if env.storage().instance().has(&key) {
            Some(env.storage().instance().get(&key).unwrap())
        } else {
            None
        }
    }

    /// Get list of all registered recipients
    pub fn get_recipient_list(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::RecipientList).unwrap_or_else(|| Vec::new(&env))
    }
}

// ── Unit Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::String;

    #[test]
    fn test_registration_and_eligibility() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fund = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(RecipientRegistryContract, ());
        let client = RecipientRegistryContractClient::new(&env, &contract_id);

        client.init(&admin, &fund, &500);

        // Not registered -> not eligible
        assert!(!client.is_eligible(&recipient));
        assert_eq!(client.get_recipient_info(&recipient), None);

        // Register
        let region = String::from_str(&env, "Region-East");
        let verify_id = String::from_str(&env, "VERIFY-100");
        client.register_recipient(&admin, &recipient, &region, &verify_id);

        // Registered -> eligible
        assert!(client.is_eligible(&recipient));
        let record = client.get_recipient_info(&recipient).unwrap();
        assert_eq!(record.region, region);
        assert_eq!(record.verification_id, verify_id);
        assert_eq!(record.total_received, 0);
        assert!(record.verified);

        // List size is 1
        let list = client.get_recipient_list();
        assert_eq!(list.len(), 1);
        assert_eq!(list.get(0).unwrap(), recipient);
    }

    #[test]
    fn test_max_cap_enforcement() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fund = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(RecipientRegistryContract, ());
        let client = RecipientRegistryContractClient::new(&env, &contract_id);

        client.init(&admin, &fund, &500); // 500 XLM max cap

        client.register_recipient(
            &admin,
            &recipient,
            &String::from_str(&env, "North"),
            &String::from_str(&env, "ID-01"),
        );

        // Mark disburse 200 (within cap)
        client.mark_disbursed(&recipient, &200);
        assert_eq!(client.get_recipient_info(&recipient).unwrap().total_received, 200);
        assert!(client.is_eligible(&recipient));

        // Mark disburse 300 (hits cap exactly)
        client.mark_disbursed(&recipient, &300);
        assert_eq!(client.get_recipient_info(&recipient).unwrap().total_received, 500);
        // At exactly cap, no longer eligible for further disbursements
        assert!(!client.is_eligible(&recipient));
    }

    #[test]
    #[should_panic(expected = "disbursement cap exceeded")]
    fn test_cap_exceeded_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fund = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(RecipientRegistryContract, ());
        let client = RecipientRegistryContractClient::new(&env, &contract_id);

        client.init(&admin, &fund, &500);

        client.register_recipient(
            &admin,
            &recipient,
            &String::from_str(&env, "North"),
            &String::from_str(&env, "ID-01"),
        );

        // Disburse 600 (exceeds 500 cap) -> panics
        client.mark_disbursed(&recipient, &600);
    }

    #[test]
    #[should_panic(expected = "not authorized: not the admin")]
    fn test_only_admin_can_register() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(RecipientRegistryContract, ());
        let client = RecipientRegistryContractClient::new(&env, &contract_id);

        client.init(&admin, &Address::generate(&env), &500);

        // Non-admin attempts to register
        client.register_recipient(
            &non_admin,
            &recipient,
            &String::from_str(&env, "West"),
            &String::from_str(&env, "ID-02"),
        );
    }
}
