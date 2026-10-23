# Development identity and release candidate 0.6.15

The runtime upload ZIP keeps the existing listing's identity when uploaded to that same Chrome Web Store item. Source 0.6.14 has no public `key` or verified store ID. A copied unpacked directory therefore receives a separate path-derived development ID. Raising its version cannot make it supersede another ID.

The preferred development route is the existing item's public identity. Chrome documents the `key` field and dashboard public-key retrieval at https://developer.chrome.com/docs/extensions/reference/manifest/key. Use the existing item's Package tab; do not create a new item, signing key, update feed, or replacement identity. The public key is not a secret. No private key is needed.

After `npm run package`, prepare a candidate using the existing item's base64 public key and separately checked item ID:

```
python3 scripts/prepare-development.py \
  --public-key-file /path/to/existing-item-public-key.txt \
  --expected-id EXISTING_32_CHARACTER_ITEM_ID \
  --output /path/to/new-unpacked-candidate
```

The helper validates the DER public key, derives and compares its Chrome ID, refuses mismatches and existing output directories, and extracts only the reviewed runtime ZIP. It adds `key` and a visible development version label to the candidate. It never loads an extension, edits a profile, or changes installed production. First validate in a disposable profile. Loading a same-ID candidate is an explicit replacement workflow, not simultaneous execution of two extension IDs; keep the production package available for rollback. Existing tabs must be reloaded after changing the running build.

A second independently keyed build is not a safe way to override 0.6.14. That version has independent clipboard listeners, DOM observers, state requests and main-world theme/form helpers. It has no authenticated peer protocol or teardown contract. Shared page DOM flags and `postMessage` cannot authorize deactivating another instance. This candidate deliberately adds no management permission or such protocol. No old installed production instance was disabled or uninstalled.

## Separate development mode

For a stable local development ID without production replacement, use:

```
python3 scripts/prepare-development.py --mode separate --output development/unpacked
```

Keep that canonical absolute folder path for subsequent builds; path-derived IDs change if moved. The prepared manifest uses the visible name Azure DevOps Niceties Development and a development version label. This mode needs no key, cannot replace production, and must be tested in a disposable profile or without running a competing instance. The command refuses to overwrite an existing folder. To refresh the same identity later, replace only the previously prepared runtime files at that same path after closing its disposable browser; do not delete a source directory or browser profile. The original upload ZIP stays unchanged. There is no runtime cooperation with another ID and no claim that a higher version arbitrates independent installs.

## Release status

0.6.15 follows the real 0.6.14 source/package history. This candidate adds identity-checked development preparation and release documentation; runtime functionality is unchanged. Production public key/ID were absent from maintained source, so a verified same-ID development folder and real installed-production replacement test remain blocked. Do not describe this release as validated for simultaneous independently keyed coexistence. Chrome 111+ is the declared browser target; Edge/other Chromium builds and Firefox/Safari are unverified.

The existing release instructions also require hosted privacy-policy synchronization and authenticated Azure DevOps review with a non-sensitive test project. Those external checks remain publisher steps; this work performs no publication.

## Verified existing production identity

Canonical Chrome listing: https://chromewebstore.google.com/detail/azure-devops-niceties/gpbpbkdbghopbppmopococphpikilelj . Product/publisher staytechco and source repository match. The current public store package was observed at 0.6.15 on 2026-10-23. Its ID is `gpbpbkdbghopbppmopococphpikilelj`; an exact installed 0.6.14 manifest public key derives to this ID. Existing runtime 0.6.15 is already published; developer preparation changes alone do not require another upload. Retrieve only the existing item's public key for local replacement; no private signing key is needed. Browser replacement checks remain unrun.
