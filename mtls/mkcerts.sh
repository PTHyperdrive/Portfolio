#!/bin/bash
# Create a private CA and one client certificate for the admin surface.
#
# The CA exists only to sign admin client certificates. It is not a general
# trust anchor and must never be used for anything else — nginx trusts it
# absolutely for the purpose of deciding who may reach /adminsystemnrsp.
set -e

DIR=~/mtls
mkdir -p "$DIR"
cd "$DIR"
umask 077

if [ -f ca.key ]; then
    echo "  CA already exists — reusing it rather than replacing it."
else
    # 10 years: rotating this means reissuing to every device, so it is not
    # something to schedule casually.
    openssl genrsa -out ca.key 4096 2>/dev/null
    openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
        -subj "/CN=NotRespond Admin CA/O=NotRespond" 2>/dev/null
    echo "  created CA"
fi

NAME="${1:-admin-workstation}"

if [ -f "${NAME}.p12" ]; then
    echo "  ${NAME}.p12 already exists — delete it first if you want a new one."
else
    openssl genrsa -out "${NAME}.key" 2048 2>/dev/null
    openssl req -new -key "${NAME}.key" -out "${NAME}.csr" \
        -subj "/CN=${NAME}/O=NotRespond Admin" 2>/dev/null
    # 825 days is the longest most browsers will accept for a leaf.
    openssl x509 -req -in "${NAME}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
        -out "${NAME}.crt" -days 825 -sha256 2>/dev/null

    # PKCS#12 is what a browser or OS keystore imports. Password-protected
    # because the file is the credential — anyone holding it and the password
    # is an administrator.
    PASS=$(openssl rand -base64 18)
    openssl pkcs12 -export -out "${NAME}.p12" \
        -inkey "${NAME}.key" -in "${NAME}.crt" -certfile ca.crt \
        -passout "pass:${PASS}" -name "NotRespond Admin (${NAME})" 2>/dev/null
    echo "  created ${NAME}.p12"
    echo "P12_PASSWORD=${PASS}"
    rm -f "${NAME}.csr"
fi

FP=$(openssl x509 -in "${NAME}.crt" -noout -fingerprint -sha256 \
     | sed 's/.*=//' | tr -d ':' | tr 'A-Z' 'a-z')
echo "FINGERPRINT=${FP}"
echo "CA_PATH=${DIR}/ca.crt"
echo "P12_PATH=${DIR}/${NAME}.p12"
ls -la "$DIR" | awk '{print "  " $1, $5, $9}' | tail -n +2
