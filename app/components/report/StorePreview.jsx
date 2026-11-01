/* eslint-disable react/prop-types */
// Storefront preview frame for a report.
//
// Renders a device-shaped frame (tall/narrow on mobile, wide browser chrome on
// desktop). When no screenshot is available it shows a neutral placeholder —
// never a broken image, and never the merchant's real storefront unless the
// report data supplies it.

export default function StorePreview({ device, screenshot }) {
  const mode = device === "desktop" ? "desktop" : "mobile";
  return (
    <div className={`psi-preview psi-preview--${mode}`}>
      <div className="psi-preview__chrome">
        <div className="psi-preview__bar" aria-hidden="true">
          <i className="psi-preview__dot psi-preview__dot--red" />
          <i className="psi-preview__dot psi-preview__dot--amber" />
          <i className="psi-preview__dot psi-preview__dot--green" />
        </div>
        <div className="psi-preview__body">
          {screenshot ? (
            <img src={screenshot} alt="Storefront preview" className="psi-preview__img" />
          ) : (
            <div className="psi-preview__placeholder">
              <s-icon type="home" aria-hidden="true" />
              <s-text color="subdued">No screenshot available</s-text>
              <s-text color="subdued">
                A storefront preview will appear here once a PageSpeed report is captured.
              </s-text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}