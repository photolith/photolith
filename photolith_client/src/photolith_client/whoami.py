class WhoAmIMixin:
    """/api/v1/whoami/, for use with PhotolithClient"""

    def whoami(self):
        """The token's user: id, username, permissions & authority_level"""
        return self.request("GET", "/api/v1/whoami/")
