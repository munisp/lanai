"""
Lanai AI Core — Twenty CRM Connector
Provides read/write access to the Twenty CRM GraphQL API.
All pillars import from here.
"""
import os
import requests
import json
import logging
from typing import Optional, List, Dict, Any

CRM_BASE_URL = os.getenv("TWENTY_CRM_URL", "").rstrip("/")
CRM_URL = CRM_BASE_URL if CRM_BASE_URL.endswith("/graphql") else f"{CRM_BASE_URL}/graphql"
CRM_TOKEN = os.getenv("TWENTY_CRM_API_TOKEN", "")

logger = logging.getLogger("lanai.crm")


class CRMConnectorError(RuntimeError):
    """Raised when the configured CRM cannot satisfy a required request."""


def _get_token() -> str:
    if not CRM_TOKEN or not CRM_BASE_URL:
        raise CRMConnectorError("Twenty CRM URL and API token must be configured")
    return CRM_TOKEN


def gql(query: str, variables: dict | None = None) -> dict:
    """Execute a GraphQL query/mutation against the configured Twenty CRM."""
    token = _get_token()
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    try:
        resp = requests.post(CRM_URL,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise CRMConnectorError("Twenty CRM returned GraphQL errors")
        return data
    except requests.RequestException as error:
        logger.error("CRM request failed: %s", error)
        raise CRMConnectorError("Twenty CRM request failed") from error


def get_people(limit: int = 50) -> List[Dict]:
    """Fetch people/clients from the CRM."""
    result = gql("""
    { people(first: %d) { edges { node {
        id
        name { firstName lastName }
        phones { primaryPhoneNumber primaryPhoneCountryCode }
        emails { primaryEmail }
        city
        jobTitle
        createdAt
        updatedAt
    } } } }
    """ % limit)
    edges = result.get("data", {}).get("people", {}).get("edges", [])
    return [e["node"] for e in edges]


def get_members(limit: int = 50) -> List[Dict]:
    """Fetch Lanai members from the CRM."""
    result = gql("""
    { members(first: %d) { edges { node {
        id
        name
        membershipTier
        memberSince
        renewalDate
        totalLifetimeValue
        preferredAdvisor
        status
        createdAt
    } } } }
    """ % limit)
    edges = result.get("data", {}).get("members", {}).get("edges", [])
    return [e["node"] for e in edges]


def get_travel_requests(limit: int = 50) -> List[Dict]:
    """Fetch travel requests from the CRM."""
    result = gql("""
    { travelRequests(first: %d) { edges { node {
        id
        name
        destination
        departureDate
        returnDate
        numberOfTravellers
        budgetRange
        status
        specialRequirements
        createdAt
    } } } }
    """ % limit)
    edges = result.get("data", {}).get("travelRequests", {}).get("edges", [])
    return [e["node"] for e in edges]


def get_opportunities(limit: int = 50) -> List[Dict]:
    """Fetch opportunities (pipeline) from the CRM."""
    result = gql("""
    { opportunities(first: %d) { edges { node {
        id
        name
        stage
        amount { amountMicros currencyCode }
        closeDate
        createdAt
    } } } }
    """ % limit)
    edges = result.get("data", {}).get("opportunities", {}).get("edges", [])
    return [e["node"] for e in edges]


def create_note(title: str, body: str, person_id: str = None) -> dict:
    """Create a note in the CRM, optionally linked to a person."""
    # Twenty's blocknote rich-text field expects a JSON array of blocks.
    body_v2 = json.dumps(
        [{"type": "paragraph", "content": [{"type": "text", "text": body}]}]
    )
    result = gql("""
    mutation CreateNote($title: String!, $body: String!, $bodyV2: String!) {
        createNote(data: {
            title: $title
            bodyV2: { markdown: $body, blocknote: $bodyV2 }
        }) { id title }
    }
    """, {"title": title, "body": body, "bodyV2": body_v2})
    note = result.get("data", {}).get("createNote", {})
    if note and person_id:
        # Link note to person
        gql("""
        mutation LinkNote($noteId: ID!, $personId: ID!) {
            createNoteTarget(data: { noteId: $noteId, targetPersonId: $personId }) { id }
        }
        """, {"noteId": note["id"], "personId": person_id})
    return note


def create_task(title: str, body: str, person_id: str = None, due_at: str = None) -> dict:
    """Create a task in the CRM."""
    body_v2 = json.dumps(
        [{"type": "paragraph", "content": [{"type": "text", "text": body}]}]
    )
    # GraphQL variables keep a caller-controlled due date out of query text.
    # This avoids an injection path through the legacy string interpolation.
    variables = {
        "title": title,
        "body": body,
        "bodyV2": body_v2,
        "dueAt": due_at,
    }
    result = gql("""
    mutation CreateTask($title: String!, $body: String!, $bodyV2: String!, $dueAt: DateTime) {
        createTask(data: {
            title: $title
            bodyV2: { markdown: $body, blocknote: $bodyV2 }
            status: TODO
            dueAt: $dueAt
        }) { id title }
    }
    """, variables)
    task = result.get("data", {}).get("createTask", {})
    if task and person_id:
        gql("""
        mutation LinkTask($taskId: ID!, $personId: ID!) {
            createTaskTarget(data: { taskId: $taskId, targetPersonId: $personId }) { id }
        }
        """, {"taskId": task["id"], "personId": person_id})
    return task


def find_person_by_phone(phone: str) -> Optional[Dict]:
    """Find a person by phone number."""
    people = get_people(200)
    for p in people:
        phones = p.get("phones", {})
        if phones:
            primary = phones.get("primaryPhoneNumber", "")
            country = phones.get("primaryPhoneCountryCode", "")
            full = f"+{country}{primary}".replace("++", "+")
            if phone.replace("+", "").replace(" ", "") in full.replace("+", "").replace(" ", ""):
                return p
    return None


def find_person_by_email(email: str) -> Optional[Dict]:
    """Find a person by email address."""
    people = get_people(200)
    for p in people:
        emails = p.get("emails", {})
        if emails and emails.get("primaryEmail", "").lower() == email.lower():
            return p
    return None


def create_person(first_name: str, last_name: str, phone: str = None, email: str = None) -> dict:
    """Create a new person in the CRM."""
    phones_clause = ""
    if phone:
        # Parse phone number. Twenty expects an ISO-3166 alpha-2 country code
        # (e.g. "US"), not a dialing code (e.g. "1").
        digits = phone.replace("+", "").replace(" ", "").replace("-", "")
        if phone.startswith("+44"):
            iso_code, dialing = "GB", "44"
        else:
            iso_code, dialing = "US", "1"
        number = digits[len(dialing):]
        phones_clause = f'phones: {{ primaryPhoneNumber: "{number}", primaryPhoneCountryCode: "{iso_code}" }}'

    emails_clause = ""
    if email:
        emails_clause = f'emails: {{ primaryEmail: "{email}" }}'

    result = gql("""
    mutation CreatePerson {
        createPerson(data: {
            name: { firstName: "%s", lastName: "%s" }
            %s
            %s
        }) { id name { firstName lastName } }
    }
    """ % (first_name, last_name, phones_clause, emails_clause))
    return result.get("data", {}).get("createPerson", {})
