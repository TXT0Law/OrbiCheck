"""Safety checks for persisted scan execution options."""

PORTS_MODULE = "ports"


def port_scan_authorized(options: object) -> bool:
    """Only explicit persisted booleans authorize an outbound port probe."""
    return (
        isinstance(options, dict)
        and options.get("enablePortScan") is True
        and options.get("acknowledgeScanAuthorization") is True
    )
