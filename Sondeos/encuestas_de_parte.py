"""
Criterio común para marcar una encuesta como «de parte» (encargada por un partido o publicada por él como sondeo interno), usado por la web y por los contrastes. (13/11/2026)

Una encuesta se marca cuando, en la tabla de Wikipedia, el cliente o la fuente (firma) es un partido, o cuando el cliente es una entidad electoral conocida (Justice Europe, es decir,
Iustitia Europa). Es un dato de la tabla, no un juicio sobre la casa: encargar una encuesta es legítimo.
"""

PROMOTORES = {"PSOE": "PSOE", "PP": "PP", "AP": "PP", "CP": "PP", "Cs": "Cs", "Vox": "Vox", "VOX": "Vox", "Podemos": "Podemos", "Sumar": "Sumar", "IU": "IU", "CDS": "CDS", "PRD": "PRD",
              "PSC": "PSC", "ERC": "ERC", "Justice Europe": "Iustitia Europa"}


def promotor_de(firma, cliente):
    """(partido o entidad promotora, motivo) o (None, None)."""
    if cliente in PROMOTORES:
        return PROMOTORES[cliente], "cliente"
    if firma in PROMOTORES:
        return PROMOTORES[firma], "firma"
    return None, None
