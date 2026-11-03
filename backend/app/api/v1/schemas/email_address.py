"""Shared email address validation at API boundaries."""

import re

EMAIL_LOCAL_PART_PATTERN = re.compile(
    r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
)
EMAIL_DOMAIN_PATTERN = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+"
)


def normalize_email_address(value: str) -> str:
    """Return one normalized mailbox address or reject malformed input."""
    recipient = value.strip()
    local, separator, domain = recipient.partition("@")
    if (
        not separator
        or EMAIL_LOCAL_PART_PATTERN.fullmatch(local) is None
        or EMAIL_DOMAIN_PATTERN.fullmatch(domain) is None
    ):
        raise ValueError("Value is not a valid email address")
    return recipient
