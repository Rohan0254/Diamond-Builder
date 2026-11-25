# Configure Diamond Ring Builder Settings

Use this action when the merchant asks to customize Diamond Ring Builder settings, such as:
- Hiding or showing diamond categories on the storefront (for example *"I don't want natural diamonds on my storefront, uncheck natural"* or *"Show gemstones on the storefront"*).
- Enabling or pausing the storefront Build Your Own Ring experience (`builderEnabled`).
- Selecting or switching the primary Ring Collection (`ringCollectionTitle`).

Workflow inside `/app`:
1. Call `get_builder_ui_state` if you need to check current checkboxes or list available Shopify collections first.
2. Call `configure_builder_settings` passing only the requested flags (e.g., `{ "natural": false, "saveNow": true }`).
3. Confirm back clearly which categories are now checked/unchecked and synced to the storefront.
