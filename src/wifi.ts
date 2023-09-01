import { Network, disconnect, list_networks, selectNetwork, scan, state } from 'rpi-fi';

export { scan, disconnect };

/**
 * Connect to a network pre-configured in wpa_supplicant.conf
 * @param ssid 
 */
export async function connectKnownNetwork(ssid:string) {
    let networks = await list_networks();
    let network = networks.find(n => n.ssid == ssid);
    if (network) {
        let ok = await selectNetwork(network.id);
        if (!ok) {
            throw new WifiConnectionError(ssid);
        }
    } else {
        throw new WifiError(`Network with SSID '${ssid}' is not configured.`);
    }
}

export async function currentNetwork() : Promise<Network|null>{
    let st = await state();
    if (st.wpa_state == "COMPLETED") {
        return {
            id: st.id,
            ssid: st.ssid,
            bssid: st.bssid,
            state: st.wpa_state
        };
    } else {
        return null;
    }
}

class WifiError extends Error {
    constructor(msg:string) {
        super(msg);
    }
}

class WifiConnectionError extends WifiError {
    constructor(ssid:string) {
        super(`Connection to network with SSID ${ssid} failed.`);
    }
}